// 打印迅雷字段污染值的完整样例，确认 URL 形态
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'games.json'), 'utf8'));
const imgRe = /https?:\/\/[^\s"'<>]+\.(png|jpe?g|gif|webp|bmp|avif|svg)/i;
let shown = 0;
for (const g of data) {
    const v = g._rawData && g._rawData['迅雷'];
    if (typeof v === 'string' && (imgRe.test(v) || /<img/i.test(v))) {
        if (shown++ >= 5) break;
        console.log('--- id', g.id, '---');
        console.log(v.slice(0, 400));
        console.log();
    }
}
console.log('共', shown, '条样例');
