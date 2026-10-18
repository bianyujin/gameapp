// 看有评级的那 875 条的评级字段真实值分布
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'games.json'), 'utf8'));

function getGameGrade(game) {
    if (!game._rawData) return null;
    const gradeKey = Object.keys(game._rawData).find(k => k.includes('评级（成品级别）'));
    let val = gradeKey ? (game._rawData[gradeKey] || '').toString().trim() : '';
    if (!val || val === '0' || val === '-' || val === gradeKey) {
        val = (game._rawData['评级'] || '').toString().trim();
        if (!val) return null;
    }
    const m = val.match(/(X|SSS|SS|S|A|B|C)/i);
    return m ? m[1].toUpperCase() : null;
}

let shown = 0;
const valSamples = new Map();
for (const g of data) {
    if (getGameGrade(g) && shown < 10) {
        shown++;
        const key = Object.keys(g._rawData).find(k => k.includes('评级'));
        console.log('---', g.id, '| key:', key ? key.slice(0, 40) : '(none)');
        console.log('   val:', JSON.stringify(String(g._rawData[key] || '').slice(0, 80)));
    }
    const grade = getGameGrade(g);
    if (grade) {
        const key = Object.keys(g._rawData).find(k => k.includes('评级'));
        const v = String(g._rawData[key] || '').trim();
        if (!valSamples.has(v)) valSamples.set(v, 0);
        valSamples.set(v, valSamples.get(v) + 1);
    }
}
console.log('\n=== 评级字段值分布（有评级的 875 条） ===');
const sorted = [...valSamples.entries()].sort((a, b) => b[1] - a[1]);
sorted.slice(0, 20).forEach(([v, c]) => console.log(String(c).padStart(4), JSON.stringify(v.slice(0, 60))));
