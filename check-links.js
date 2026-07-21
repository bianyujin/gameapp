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
const CACHE_FILE = path.join(__dirname, 'links-cache.json');
const CACHE_DAYS = 7; // 缓存7天，7天内链接状态不变就跳过

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
    if (!result) return false;
    // 404/410 直接算失效
    if (result.status === 404 || result.status === 410) return true;
    if (!result.html) return false;
    const t = result.html;
    if (url.includes('pan.baidu.com')) {
        // 有效特征优先：有提取码输入框说明链接有效（即使版权声明含"分享内容可能"也不算失效）
        if (/请输入提取码|提取码已复制|输入提取码|share-pwd|sharePwd/i.test(t)) return false;
        // 明确的失效特征（去掉宽泛的"分享内容可能因为"）
        return /啊哦，你来晚了|链接不存在|分享已失效|此链接分享内容可能因为涉及侵权|分享的文件已经被删除|该分享已删除|此链接已失效|无效的分享/i.test(t);
    }
    if (url.includes('pan.quark.cn')) {
        return /分享已取消|文件已被分享者删除|资源已删除|分享已过期|你访问的页面不存在|页面不存在|分享失效/i.test(t);
    }
    if (url.includes('pan.xunlei.com')) {
        return /分享已删除|文件已删除|已失效|资源不存在|该分享已取消|分享取消/i.test(t);
    }
    if (url.includes('drive.uc.cn') || url.includes('pan.uc.cn')) {
        return /分享已取消|文件已被分享者删除|资源已删除|分享已过期|分享失效/i.test(t);
    }
    return false;
}

// 缓存读写：链接状态7天内不重复检测
function loadCache() {
    try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8')) || {}; }
    catch(e) { return {}; }
}
function saveCache(cache) {
    // 清理过期缓存，避免文件越来越大
    const now = Date.now();
    const maxAge = CACHE_DAYS * 24 * 3600 * 1000;
    let cleaned = 0;
    for (const url in cache) {
        if (!cache[url].time || (now - cache[url].time) > maxAge) {
            delete cache[url];
            cleaned++;
        }
    }
    if (cleaned > 0) console.log('清理过期缓存: ' + cleaned + ' 条');
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache), 'utf-8');
}
function isCacheValid(entry) {
    if (!entry || !entry.time) return false;
    return (Date.now() - entry.time) < CACHE_DAYS * 24 * 3600 * 1000;
}

async function processFile(file, cache) {
    const games = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const allTasks = [];
    for (const game of games) {
        game._invalidLinks = [];
        if (!game._rawData) continue;
        for (const field of LINK_FIELDS) {
            const key = Object.keys(game._rawData).find(k => k.includes(field));
            if (!key) continue;
            const url = extractUrl(game._rawData[key]);
            if (!url) continue;
            allTasks.push({ game, field, url });
        }
    }

    // 分流：缓存命中 vs 需检测
    const tasks = [];
    let cacheHit = 0;
    let cacheInvalid = 0;
    for (const task of allTasks) {
        const cached = cache[task.url];
        if (isCacheValid(cached)) {
            cacheHit++;
            if (cached.invalid) {
                task.game._invalidLinks.push(task.field);
                cacheInvalid++;
            }
        } else {
            tasks.push(task);
        }
    }
    console.log('  共 ' + allTasks.length + ' 个链接，缓存命中 ' + cacheHit + '（其中失效 ' + cacheInvalid + '），需检测 ' + tasks.length);

    if (tasks.length === 0) {
        console.log('  全部命中缓存，跳过检测');
        fs.writeFileSync(file, JSON.stringify(games), 'utf-8');
        return cacheInvalid;
    }

    let idx = 0;
    let invalidCount = cacheInvalid;
    let okCount = 0;
    let failCount = 0;
    const stats = {};
    const sampleLogs = [];

    async function worker() {
        while (idx < tasks.length) {
            const task = tasks[idx++];
            const result = await fetch(task.url);
            const host = new URL(task.url).hostname;
            if (!stats[host]) stats[host] = { total: 0, ok: 0, invalid: 0, fail: 0 };
            stats[host].total++;

            const invalid = isInvalid(task.url, result);
            // 写入缓存（请求失败不缓存，下次重试）
            if (result && (result.html || result.status)) {
                cache[task.url] = { invalid: invalid, time: Date.now() };
            }

            if (invalid) {
                task.game._invalidLinks.push(task.field);
                invalidCount++;
                stats[host].invalid++;
            } else if (result && (result.html || result.status)) {
                okCount++;
                stats[host].ok++;
            } else {
                failCount++;
                stats[host].fail++;
            }

            if (sampleLogs.length < 5) {
                sampleLogs.push({
                    url: task.url.substring(0, 60),
                    status: result ? result.status : '无响应',
                    htmlLen: result && result.html ? result.html.length : 0,
                    matched: invalid
                });
            }

            if (idx % 100 === 0) console.log('  已检测 ' + idx + '/' + tasks.length + '，失效 ' + (invalidCount - cacheInvalid) + '，失败 ' + failCount);
        }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

    if (sampleLogs.length > 0) {
        console.log('  --- 前5个请求详情 ---');
        sampleLogs.forEach((s, i) => {
            console.log('  [' + (i+1) + '] ' + s.url);
            console.log('      状态: ' + s.status + '，HTML长度: ' + s.htmlLen + '，判定失效: ' + s.matched);
        });
    }
    if (Object.keys(stats).length > 0) {
        console.log('  --- 按网盘统计（本次检测） ---');
        for (const host in stats) {
            const s = stats[host];
            console.log('  ' + host + ': 共' + s.total + '，有效' + s.ok + '，失效' + s.invalid + '，失败' + s.fail);
        }
    }
    console.log('  --- 总计 ---');
    console.log('  有效: ' + okCount + '，失效: ' + invalidCount + '，请求失败/超时: ' + failCount);

    fs.writeFileSync(file, JSON.stringify(games), 'utf-8');
    console.log('  检测完成: ' + tasks.length + ' 个链接，失效 ' + invalidCount + ' 个');
    return invalidCount;
}

async function main() {
    console.log('=== 网盘链接失效检测 ===');
    const cache = loadCache();
    console.log('缓存: ' + Object.keys(cache).length + ' 条记录');
    let total = 0;
    for (const f of ['games.json', 'collections.json']) {
        const file = path.join(__dirname, f);
        if (fs.existsSync(file)) {
            console.log('\n检测 ' + f + '...');
            total += await processFile(file, cache);
        }
    }
    saveCache(cache);
    console.log('缓存已保存: ' + Object.keys(cache).length + ' 条记录');
    console.log('\n=== 完成，共失效 ' + total + ' 个链接 ===');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
