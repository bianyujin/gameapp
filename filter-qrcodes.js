const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const jsQR = require('jsqr');
const { PNG } = require('pngjs');
const jpeg = require('jpeg-js');

const GAMES_FILE = path.join(__dirname, 'games.json');
const CHECKED_FILE = path.join(__dirname, 'checked-urls.json');

function fetchBuffer(url, timeoutMs) {
    timeoutMs = timeoutMs || 15000;
    return new Promise(function(resolve, reject) {
        var mod = url.indexOf('https') === 0 ? https : http;
        var req = mod.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://pic.moebox.io/' },
            timeout: timeoutMs
        }, function(res) {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                fetchBuffer(res.headers.location, timeoutMs).then(resolve).catch(reject);
                return;
            }
            if (res.statusCode !== 200) {
                reject(new Error('HTTP ' + res.statusCode));
                return;
            }
            var chunks = [];
            res.on('data', function(c) { chunks.push(c); });
            res.on('end', function() { resolve(Buffer.concat(chunks)); });
        });
        req.on('error', reject);
        req.on('timeout', function() { req.destroy(); reject(new Error('timeout')); });
    });
}

function isQRCode(buffer) {
    try {
        var png = PNG.sync.read(buffer);
        var code = jsQR(png.data, png.width, png.height);
        if (code && code.data) return true;
    } catch(e) {}
    try {
        var jpg = jpeg.decode(buffer, { useTArray: true });
        if (jpg && jpg.data) {
            var code2 = jsQR(jpg.data, jpg.width, jpg.height);
            if (code2 && code2.data) return true;
        }
    } catch(e) {}
    return false;
}

function isDetectable(url) {
    return /\.(jpg|jpeg|png)(\?|$)/i.test(url);
}

async function main() {
    var forceMode = process.argv.includes('--force');

    // 读取已检查过的 URL 记录
    var checkedUrls = {};
    if (!forceMode) {
        try {
            checkedUrls = JSON.parse(fs.readFileSync(CHECKED_FILE, 'utf-8'));
            console.log('已检查过的图片: ' + Object.keys(checkedUrls).length + ' 张');
        } catch(e) {
            console.log('无历史检查记录，将检查所有图片');
        }
    }

    console.log('Reading games.json...');
    var raw = fs.readFileSync(GAMES_FILE, 'utf-8');
    var games = JSON.parse(raw);

    var tasks = [];
    for (var i = 0; i < games.length; i++) {
        var game = games[i];
        if (!game.coverUrls || !Array.isArray(game.coverUrls) || game.coverUrls.length === 0) continue;
        for (var j = 0; j < game.coverUrls.length; j++) {
            var url = game.coverUrls[j];
            if (!isDetectable(url)) continue;
            if (!forceMode && checkedUrls[url] === true) continue;
            tasks.push({ game: game, url: url });
        }
    }

    // 移除已知二维码URL（之前检测到的，标记为 false 的）
    var qrRemoved = 0;
    for (var i = 0; i < games.length; i++) {
        var game = games[i];
        if (!game.coverUrls || !Array.isArray(game.coverUrls)) continue;
        var before = game.coverUrls.length;
        game.coverUrls = game.coverUrls.filter(function(url) { return checkedUrls[url] !== false; });
        var after = game.coverUrls.length;
        qrRemoved += (before - after);
    }
    if (qrRemoved > 0) {
        console.log('移除已知二维码图片: ' + qrRemoved + ' 张');
        fs.writeFileSync(GAMES_FILE, JSON.stringify(games, null, 2), 'utf-8');
    }

    var skipped = Object.keys(checkedUrls).length;
    console.log('Need check: ' + tasks.length + ' images (skipped ' + skipped + ' already checked)');

    if (tasks.length === 0) {
        console.log('✅ 没有新图片需要检查');
        return;
    }
    var detected = 0;
    var checked = 0;
    var errors = 0;
    var qrUrls = {};

    var batchSize = 10;
    for (var i = 0; i < tasks.length; i += batchSize) {
        var batch = tasks.slice(i, i + batchSize);
        await Promise.all(batch.map(async function(task) {
            try {
                var buf = await fetchBuffer(task.url, 15000);
                if (isQRCode(buf)) {
                    detected++;
                    qrUrls[task.url] = true;
                    if (detected <= 30) {
                        console.log('  [QR] ' + (task.game.title || '').substring(0, 25) + ' - ' + task.url.substring(0, 60));
                    }
                }
            } catch(e) {
                errors++;
            }
            checked++;
        }));
        if ((i + batchSize) % 100 === 0 || i + batchSize >= tasks.length) {
            console.log('Progress: ' + Math.min(i + batchSize, tasks.length) + '/' + tasks.length + ' | QR:' + detected + ' Err:' + errors);
        }
    }

    console.log('\n========== Done ==========');
    console.log('Checked: ' + checked);
    console.log('QR found: ' + detected);
    console.log('Errors: ' + errors);

    if (detected === 0) {
        console.log('No QR codes found, no update needed.');
        // 即使没发现二维码，也要更新检查记录
        tasks.forEach(function(task) { checkedUrls[task.url] = qrUrls[task.url] ? false : true; });
        try {
            fs.writeFileSync(CHECKED_FILE, JSON.stringify(checkedUrls), 'utf-8');
            console.log('已更新检查记录: ' + Object.keys(checkedUrls).length + ' 张图片');
        } catch(e) {
            console.log('⚠️ 检查记录保存失败:', e.message);
        }
        return;
    }

    var removed = 0;
    var gamesAffected = 0;
    for (var i = 0; i < games.length; i++) {
        var game = games[i];
        if (!game.coverUrls || !Array.isArray(game.coverUrls)) continue;
        var before = game.coverUrls.length;
        game.coverUrls = game.coverUrls.filter(function(url) { return !qrUrls[url]; });
        var after = game.coverUrls.length;
        if (before > after) {
            removed += (before - after);
            gamesAffected++;
        }
    }

    console.log('\nRemoved QR images: ' + removed);
    console.log('Games affected: ' + gamesAffected);

    console.log('\nWriting games.json...');
    fs.writeFileSync(GAMES_FILE, JSON.stringify(games, null, 2), 'utf-8');

    // 更新已检查记录（二维码标记为 false，非二维码标记为 true）
    tasks.forEach(function(task) { checkedUrls[task.url] = qrUrls[task.url] ? false : true; });
    try {
        fs.writeFileSync(CHECKED_FILE, JSON.stringify(checkedUrls), 'utf-8');
        console.log('已更新检查记录: ' + Object.keys(checkedUrls).length + ' 张图片');
    } catch(e) {
        console.log('⚠️ 检查记录保存失败:', e.message);
    }

    console.log('Done!');
}

main().catch(function(e) { console.error('FATAL:', e); process.exit(1); });
