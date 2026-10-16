// 检查线上 games.json 迅雷字段里残留的图片链接数量
// 数据源优先级: 本地 games.json（同步脚本刚生成）→ /api/private-data 不可用 → 站点根 games.json
const fs = require('fs');
const path = require('path');

function loadLocal() {
    const p = path.join(__dirname, '..', 'games.json');
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    return null;
}

function get(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let buf = '';
            res.on('data', (c) => (buf += c));
            res.on('end', () => resolve(buf));
        }).on('error', reject);
    });
}

(async () => {
    let data = loadLocal();
    let src = '本地 site/games.json';
    if (!data) {
        data = JSON.parse(await get('https://gameapp-2e8.pages.dev/games.json'));
        src = '线上 pages.dev/games.json';
    }
    const imgRe = /https?:\/\/[^\s"'<>]+\.(png|jpe?g|gif|webp|bmp|avif|svg)/i;
    let hits = [];
    for (const g of data) {
        const v = g._rawData && g._rawData['迅雷'];
        if (typeof v === 'string' && imgRe.test(v)) {
            hits.push(String(g.id) + ': ' + v.slice(0, 100));
        }
    }
    console.log('数据源:', src);
    console.log('迅雷字段图片链接命中:', hits.length);
    hits.slice(0, 10).forEach((h) => console.log('  ' + h));
})();
