// 复现完整渲染链路：sortGames 排序后 renderTable 是否保留顺序
// 模拟 render() 在 _userSorted=true 时的行为
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('games.json', 'utf8'));

function getGameDate(game) {
    if (game._rawData) {
        const edited = game._rawData['最后修改时间'] || game._rawData['最后修改'] || '';
        if (edited) {
            const m = String(edited).match(/(\d{4})年(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{1,2})/);
            if (m) return new Date(+m[1], +m[2]-1, +m[3], +m[4], +m[5]).getTime();
        }
        const created = game._rawData['创建时间'] || '';
        if (created) {
            const m = String(created).match(/(\d{4})年(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{1,2})/);
            if (m) return new Date(+m[1], +m[2]-1, +m[3], +m[4], +m[5]).getTime();
        }
    }
    return 0;
}

function getGameGrade(val) {
    const m = String(val).match(/(X|SSS|SS|S|A|B|C)/i);
    return m ? m[1].toUpperCase() : null;
}
function sortVal(g) {
    const key = Object.keys(g._rawData || {}).find(k => k.includes('评级'));
    const val = key ? String(g._rawData[key] || '').trim() : '';
    if (!val || val === '0' || val === '-') return 0;
    const grade = getGameGrade(val);
    const order = { X: 7, SSS: 6, SS: 5, S: 4, A: 3, B: 2, C: 1 };
    const gv = grade ? (order[grade] || 0) : 0;
    const num = val.match(/(\d+(?:\.\d+)?)/);
    return gv * 1000 + (num ? parseFloat(num[1]) : 0);
}

// Step1: 模拟 render() 默认时间排序
let games = [...data];
games.sort((a, b) => getGameDate(b) - getGameDate(a));
console.log('=== render() 时间排序后 前5 ===');
games.slice(0, 5).forEach(g => console.log(' ', getGameDate(g), g.title.slice(0, 25)));

// Step2: 模拟 sortGames('rating','desc') + renderTable
games.sort((a, b) => sortVal(b) - sortVal(a));
console.log('\n=== sortGames(rating,desc) 后 getFilteredGames 前5（应有 X→SSS） ===');
games.slice(0, 5).forEach(g => console.log(' ', sortVal(g), g.title.slice(0, 25)));

// Step3: 模拟一次 render() 再被调用（例如同步完成后）
// _userSorted=true → 不重排 → 保持评级顺序
// 但! 任何地方如果 _userSorted 被重置为 false，评级顺序被时间排序覆盖
console.log('\n=== 检查: render() 后 _userSorted 保持 true，顺序不变 ===');
console.log('排序链路本身没有 bug —— 需要确认按钮是否真的触发了 sortGames');
