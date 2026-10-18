// 检查线上 games.json 的评级字段真实形态 + 统计，验证排序逻辑是否能命中
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'games.json'), 'utf8'));

// 模拟 getGameGrade + getGradeSortValue
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
function getGradeSortValue(game) {
    const grade = getGameGrade(game);
    const gradeOrder = { X: 7, SSS: 6, SS: 5, S: 4, A: 3, B: 2, C: 1 };
    const gradeVal = grade ? (gradeOrder[grade] || 0) : 0;
    if (!game._rawData) return gradeVal * 1000;
    const gradeKey = Object.keys(game._rawData).find(k => k.includes('评级（成品级别）'));
    if (!gradeKey) return gradeVal * 1000;
    const raw = (game._rawData[gradeKey] || '').toString();
    const numMatch = raw.match(/(\d+(?:\.\d+)?)/);
    const score = numMatch ? parseFloat(numMatch[1]) : 0;
    return gradeVal * 1000 + score;
}

const gradeCount = {};
let withGrade = 0, noGrade = 0;
const samples = [];
for (const g of data) {
    const grade = getGameGrade(g);
    if (grade) { withGrade++; gradeCount[grade] = (gradeCount[grade] || 0) + 1; }
    else noGrade++;
    if (samples.length < 8) {
        const key = Object.keys(g._rawData || {}).find(k => k.includes('评级'));
        samples.push({ id: g.id, key: key ? key.slice(0, 30) : '(none)', val: key ? String(g._rawData[key]).slice(0, 50) : '', grade, sortVal: getGradeSortValue(g) });
    }
}
console.log('总数:', data.length, '| 有评级:', withGrade, '| 无评级:', noGrade);
console.log('评级分布:', JSON.stringify(gradeCount));
console.log('\n样例:');
samples.forEach(s => console.log(JSON.stringify(s)));
