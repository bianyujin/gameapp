// 扫描指定提交的 games.json 中迅雷字段残留图片链接数量
// 用法: node tools/scan-commit-games.js <ref>
const { execSync } = require('child_process');
const path = require('path');
const ref = process.argv[2] || 'origin/main';
const buf = execSync('git show ' + ref + ':games.json', { maxBuffer: 1024 * 1024 * 64, cwd: path.join(__dirname, '..') });
const d = JSON.parse(buf.toString('utf8'));
const imgRe = /https?:\/\/[^\s"'<>]+\.(png|jpe?g|gif|webp|bmp|avif|svg)/i;
let n = 0;
for (const g of d) {
    const v = g._rawData && g._rawData['迅雷'];
    if (typeof v === 'string' && imgRe.test(v)) n++;
}
console.log(ref, 'games.json 迅雷图片命中:', n, '/ 总数', d.length);
