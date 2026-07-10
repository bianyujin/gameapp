/**
 * 封面图提取脚本
 * 
 * 用法：node extract-covers.js
 * 读取 games.json，从预览链接提取真实图片URL，写入 coverUrls 字段
 * 每条游戏存 2-3 张图片URL，前端随机取一张显示
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const GAMES_FILE = path.join(__dirname, 'games.json');

// ========== 图片提取逻辑（与 app.js extractImagesFromHtml 一致）==========
function extractImagesFromHtml(html, baseUrl) {
    const imgs = [];
    let m;

    // 1. 通用 <img src> 提取
    const imgRe = /<img[^>]+src=["']([^"']+)["']/gi;
    while ((m = imgRe.exec(html)) !== null) {
        let src = m[1];
        if (/icon|logo|avatar|favicon|emoji|svg|1x1|pixel|tracking/i.test(src)) continue;
        if (!/^https?:\/\//i.test(src)) {
            try { src = new URL(src, baseUrl).href; } catch(e) { continue; }
        }
        if (src.length > 25 && /\.(jpg|jpeg|png|webp|bmp)(\?|$)/i.test(src) && !imgs.includes(src)) {
            imgs.push(src);
        }
    }

    // 2. moebox.io 相册：提取 image.acg.lol 的 .md.jpg 直链
    //    pic.moebox.io/image/xxx 是相册页面URL（返回HTML），不是图片直链
    //    真实图片直链在 HTML 里是 image.acg.lol/file/xxx.md.jpg 格式
    if (baseUrl.includes('moebox.io')) {
        const acgRe = /https?:\/\/image\.acg\.lol\/file\/[^\s"'<>]+\.md\.(?:jpg|jpeg|png|gif|webp)/gi;
        while ((m = acgRe.exec(html)) !== null) {
            if (!imgs.includes(m[0])) imgs.push(m[0]);
        }
    }

    // 3. ibb.co: og:image 或 class="image"
    if (baseUrl.includes('ibb.co')) {
        const ogRe = /content=["']([^"']*\.(?:jpg|jpeg|png|webp)[^"']*?)["'][^>]*property="og:image"/i;
        m = ogRe.exec(html);
        if (m && !imgs.includes(m[1])) imgs.unshift(m[1]);

        const clsRe = /<img[^>]+class="[^"]*image[^"]*"[^>]+src=["']([^"']+)["']/i;
        m = clsRe.exec(html);
        if (m && !imgs.includes(m[1])) imgs.unshift(m[1]);
    }

    // 4. tu.coklw.vip: 相对路径图片
    if (baseUrl.includes('coklw.vip')) {
        const cokRe = /src=["'](\/[^"']*\.(?:jpg|jpeg|png|webp)[^"']*?)["']/gi;
        while ((m = cokRe.exec(html)) !== null) {
            const u = 'https://tu.coklw.vip' + m[1];
            if (!imgs.includes(u)) imgs.push(u);
        }
    }

    return imgs;
}

// ========== HTTP 请求（带超时）==========
function fetchUrl(url, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
        const mod = url.startsWith('https') ? https : http;
        const req = mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: timeoutMs }, (res) => {
            // 跟随重定向（最多5次）
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                fetchUrl(res.headers.location, timeoutMs).then(resolve).catch(reject);
                return;
            }
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
            }
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
}

// ========== 主流程 ==========
async function main() {
    const forceMode = process.argv.includes('--force');
    console.log(`读取 games.json...${forceMode ? ' (强制模式: 重新提取所有封面)' : ''}`);
    const raw = fs.readFileSync(GAMES_FILE, 'utf-8');
    const games = JSON.parse(raw);

    let total = 0;
    let success = 0;
    let skipped = 0;
    let failed = 0;
    const errors = [];

    for (let i = 0; i < games.length; i++) {
        const game = games[i];
        total++;

        // 跳过已有 coverUrls 的（--force 模式下不跳过）
        if (!forceMode && game.coverUrls && Array.isArray(game.coverUrls) && game.coverUrls.length > 0) {
            skipped++;
            continue;
        }

        // 找预览链接
        if (!game._rawData) continue;
        const preview = game._rawData['预览'] || '';
        if (!preview || !/^https?:\/\//i.test(preview) || preview.includes('notion.com')) {
            continue;
        }

        // 每50条打印进度
        if (total % 50 === 0) {
            console.log(`进度: ${total}/${games.length} | 成功:${success} 失败:${failed} 跳过:${skipped}`);
        }

        try {
            const html = await fetchUrl(preview, 8000);

            // 检测加密相册（moebox 等），快速跳过
            if (/需要密码|password.*required|enter.*password/i.test(html.substring(0, 2000))) {
                failed++;
                if (errors.length < 30) {
                    errors.push(`[${game.title?.substring(0,30)}] 加密相册，跳过`);
                }
                continue;
            }

            const urls = extractImagesFromHtml(html, preview);

            if (urls.length > 0) {
                // 随机选 2-3 张（如果有的话）
                const count = Math.min(urls.length, Math.floor(Math.random() * 2) + 2);
                const shuffled = urls.sort(() => Math.random() - 0.5);
                game.coverUrls = shuffled.slice(0, count);
                success++;
                
                if (success % 20 === 0) {
                    console.log(`  [${game.title.substring(0, 40)}] → ${count}张图`);
                }
            } else {
                failed++;
            }
        } catch (e) {
            failed++;
            if (errors.length < 10) {
                errors.push(`[${game.title?.substring(0,30)}] ${e.message}`);
            }
        }

        // 避免请求过快，间隔 200ms
        await new Promise(r => setTimeout(r, 200));
    }

    // 写回文件
    console.log('\n写入 games.json...');
    fs.writeFileSync(GAMES_FILE, JSON.stringify(games, null, 2), 'utf-8');

    console.log('\n========== 完成 ==========');
    console.log(`总处理: ${total}`);
    console.log(`成功提取: ${success}`);
    console.log(`失败(无图/超时): ${failed}`);
    console.log(`跳过(已有): ${skipped}`);
    
    if (errors.length > 0) {
        console.log('\n部分错误:');
        errors.forEach(e => console.log('  -', e));
    }

    // 统计覆盖率
    const withCovers = games.filter(g => g.coverUrls && g.coverUrls.length > 0).length;
    console.log(`\n封面覆盖率: ${withCovers}/${games.length} (${(withCovers/games.length*100).toFixed(1)}%)`);
}

main().catch(console.error);
