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

    // 2. moebox.io 相册：提取 image.acg.lol 图片直链
    //    页面里有 .md.png（中图）、.th.png（缩略图）、.png（原图）等格式
    //    优先用 .md.xxx，过滤 .th. 缩略图
    if (baseUrl.includes('moebox.io')) {
        const acgRe = /https?:\/\/image\.acg\.lol\/file\/[^\s"'<>]+\.(?:jpg|jpeg|png|gif|webp)/gi;
        while ((m = acgRe.exec(html)) !== null) {
            if (m[0].includes('.th.')) continue;
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
async function processFile(filePath, label, forceMode) {
    console.log(`\n--- ${label} ---`);
    console.log(`读取 ${path.basename(filePath)}...${forceMode ? ' (强制模式)' : ''}`);
    let games = [];
    try {
        games = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch(e) {
        console.log('文件不存在或为空，跳过');
        return;
    }

    let success = 0;
    let skipped = 0;
    let failed = 0;
    const errors = [];

    // 收集需要处理的游戏
    const needProcess = [];
    for (const game of games) {
        if (!forceMode && game.coverUrls && Array.isArray(game.coverUrls) && game.coverUrls.length > 0) {
            skipped++;
            continue;
        }
        if (!game._rawData) continue;
        const preview = game._rawData['预览'] || '';
        if (!preview || !/^https?:\/\//i.test(preview) || preview.includes('notion.com')) continue;
        needProcess.push({ game, preview });
    }

    console.log(`需处理: ${needProcess.length}, 跳过: ${skipped}`);

    // 并发处理（每批10个）
    const batchSize = 10;
    for (let i = 0; i < needProcess.length; i += batchSize) {
        const batch = needProcess.slice(i, i + batchSize);
        await Promise.all(batch.map(async ({ game, preview }) => {
            try {
                const previewUrls = preview.split('\n').map(s => s.trim()).filter(s => /^https?:\/\//i.test(s));
                let allImgs = [];
                for (const url of previewUrls) {
                    try {
                        const html = await fetchUrl(url, 15000);
                        if (/需要密码|password.*required|enter.*password/i.test(html.substring(0, 2000))) {
                            if (errors.length < 30) errors.push(`[${game.title?.substring(0,30)}] 加密相册: ${url}`);
                            continue;
                        }
                        const imgs = extractImagesFromHtml(html, url);
                        allImgs = allImgs.concat(imgs);
                    } catch(e) {}
                }
                const unique = [...new Set(allImgs)];
                if (unique.length > 0) {
                    const count = Math.min(unique.length, 10);
                    game.coverUrls = unique.sort(() => Math.random() - 0.5).slice(0, count);
                    success++;
                } else {
                    failed++;
                }
            } catch (e) {
                failed++;
                if (errors.length < 30) errors.push(`[${game.title?.substring(0,30)}] ${e.message}`);
            }
        }));
        console.log(`进度: ${Math.min(i + batchSize, needProcess.length)}/${needProcess.length} | 成功:${success} 失败:${failed}`);
    }

    console.log(`写入 ${path.basename(filePath)}...`);
    fs.writeFileSync(filePath, JSON.stringify(games, null, 2), 'utf-8');

    console.log(`成功: ${success}, 失败: ${failed}, 跳过: ${skipped}`);
    if (errors.length > 0) {
        errors.slice(0, 5).forEach(e => console.log('  -', e));
    }
    const withCovers = games.filter(g => g.coverUrls && g.coverUrls.length > 0).length;
    console.log(`覆盖率: ${withCovers}/${games.length} (${games.length > 0 ? (withCovers/games.length*100).toFixed(1) : 0}%)`);
}

async function main() {
    const forceMode = process.argv.includes('--force');
    const COLLECTIONS_FILE = path.join(__dirname, 'collections.json');

    await processFile(GAMES_FILE, '主数据', forceMode);
    await processFile(COLLECTIONS_FILE, '合集数据', forceMode);

    console.log('\n========== 完成 ==========');
    console.log('\n提示: 运行 node filter-qrcodes.js 可过滤二维码图片');
}

main().catch(console.error);
