// 检查线上（pages.dev / githubusercontent）games.json 迅雷字段残留图片链接数量
// 用法: node tools/check-xunlei-img.js [remote]
//   无参数 = 本地 site/games.json；remote = 线上 pages.dev/games.json
const fs = require('fs');
const path = require('path');
const https = require('https');

function get(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { timeout: 60000 }, (res) => {
            let buf = '';
            res.on('data', (c) => (buf += c));
            res.on('end', () => resolve(buf));
        }).on('error', reject).on('timeout', function () { this.destroy(new Error('timeout')); });
    });
}

(async () => {
    const wantRemote = process.argv.includes('remote');
    let data, src;
    if (wantRemote) {
        data = JSON.parse(await get('https://gameapp-2e8.pages.dev/games.json'));
        src = '线上 pages.dev/games.json';
    } else {
        const p = path.join(__dirname, '..', 'games.json');
        if (!fs.existsSync(p)) {
            console.log('本地 games.json 不存在，自动改用线上');
            data = JSON.parse(await get('https://gameapp-2e8.pages.dev/games.json'));
            src = '线上 pages.dev/games.json';
        } else {
            data = JSON.parse(fs.readFileSync(p, 'utf8'));
            src = '本地 site/games.json';
        }
    }
    const imgRe = /https?:\/\/[^\s"'<>]+\.(png|jpe?g|gif|webp|bmp|avif|svg)/i;
    const hits = [];
    for (const g of data) {
        const v = g._rawData && g._rawData['迅雷'];
        if (typeof v === 'string' && imgRe.test(v)) {
            hits.push(String(g.id) + ': ' + v.slice(0, 90));
        }
    }
    console.log('数据源:', src, '| 总条数:', data.length);
    console.log('迅雷字段图片链接命中:', hits.length);
    hits.slice(0, 10).forEach((h) => console.log('  ' + h));
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
