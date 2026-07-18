/**
 * 网盘链接失效检测脚本
 * 检测 games.json / collections.json 里的网盘链接是否失效
 * 失效链接标记到 game._invalidLinks 数组
 *
 * 用法：node check-links.js
 * 请求由 GitHub Actions 服务器发出，不影响用户 IP
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const LINK_FIELDS = ['百度', '迅雷', 'UC', '夸克'];
const CONCURRENCY = 8;
const TIMEOUT = 12000;

function extractUrl(text) {
    if (!text) return null;
    const m = String(text).match(/https?:\/\/[^\s\n,，]+/i);
    return m ? m[0] : null;
}

function fetch(url, redirects) {
    redirects = redirects || 0;
    return new Promise((resolve) => {
        if (redirects > 5) return resolve({ ok: false, html: '' });
        const lib = url.startsWith('https') ? https : http;
        const req = lib.get(url, {
            timeout: TIMEOUT,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html',
                'Accept-Language': 'zh-CN,zh;q=0.9'
            }
        }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                let loc = res.headers.location;
                if (loc.startsWith('/')) loc = new URL(url).origin + loc;
                res.resume();
                return fetch(loc, redirects + 1).then(resolve);
            }
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve({ ok: res.statusCode === 200, html: data, status: res.statusCode }));
        });
        req.on('error', () => resolve({ ok: false, html: '' }));
        req.on('timeout', () => { req.destroy(); resolve({ ok: false, html: '' }); });
    });
}

// 判断是否失效：只认明确的失效特征，请求失败/超时不算失效
function isInvalid(url, result) {
    if (!result || !result.html) return false;
    const t = result.html;
    if (url.includes('pan.baidu.com')) {
        return /啊哦，你来晚了|链接不存在|分享已失效|此链接分享内容可能因为涉及侵权|分享的文件已经被删除|该分享已删除/i.test(t);
    }
    if (url.includes('pan.quark.cn')) {
        return /分享已取消|文件已被分享者删除|资源已删除|分享已过期|你访问的页面不存在/i.test(t);
    }
    if (url.includes('pan.xunlei.com')) {
        return /分享已删除|文件已删除|已失效|资源不存在|该分享已取消/i.test(t);
    }
    if (url.includes('drive.uc.cn') || url.includes('pan.uc.cn')) {
        return /分享已取消|文件已被分享者删除|资源已删除|分享已过期/i.test(t);
    }
    return false;
}

async function processFile(file) {
    const games = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const tasks = [];
    for (const game of games) {
        game._invalidLinks = [];
        if (!game._rawData) continue;
        for (const field of LINK_FIELDS) {
            const key = Object.keys(game._rawData).find(k => k.includes(field));
            if (!key) continue;
            const url = extractUrl(game._rawData[key]);
            if (!url) continue;
            tasks.push({ game, field, url });
        }
    }
    console.log('  共 ' + tasks.length + ' 个链接待检测');

    let idx = 0;
    let invalidCount = 0;
    async function worker() {
        while (idx < tasks.length) {
            const task = tasks[idx++];
            const result = await fetch(task.url);
            if (isInvalid(task.url, result)) {
                task.game._invalidLinks.push(task.field);
                invalidCount++;
            }
            if (idx % 50 === 0) console.log('  已检测 ' + idx + '/' + tasks.length + '，失效 ' + invalidCount);
        }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

    fs.writeFileSync(file, JSON.stringify(games, null, 2), 'utf-8');
    console.log('  检测完成: ' + tasks.length + ' 个链接，失效 ' + invalidCount + ' 个');
    return invalidCount;
}

async function main() {
    console.log('=== 网盘链接失效检测 ===');
    let total = 0;
    for (const f of ['games.json', 'collections.json']) {
        const file = path.join(__dirname, f);
        if (fs.existsSync(file)) {
            console.log('\n检测 ' + f + '...');
            total += await processFile(file);
        }
    }
    console.log('\n=== 完成，共失效 ' + total + ' 个链接 ===');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
