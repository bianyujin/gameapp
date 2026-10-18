// 端到端验证: 用新 split-data 字段结构 → 模拟 App 排序
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('games.json', 'utf8'));
const liteGames = [];
for (const g of data) {
    const rd = g._rawData || {};
    const blob = Object.values(rd).filter(v => typeof v === 'string').join('\n');
    const gradeKey = Object.keys(rd).find(k => k.includes('评级'));
    liteGames.push({
        id: g.id, title: g.title, icon: g.icon, category: g.category, rating: g.rating,
        downloads: g.downloads, updateDate: g.updateDate, isFavorite: g.isFavorite,
        coverUrls: g.coverUrls || [],
        _rawData: {
            '文件ID': rd['文件ID'] || '', '类型': rd['类型'] || '', '全文': blob,
            '_评级': gradeKey ? (rd[gradeKey] || '') : '',
            '_最后修改': rd['最后修改时间'] || '', '_创建': rd['创建时间'] || ''
        }, _c: 0
    });
}

function getGrade(v) { const m = String(v).match(/(X|SSS|SS|S|A|B|C)/i); return m ? m[1].toUpperCase() : null; }
function sortVal(g) {
    const gradeKey = Object.keys(g._rawData).find(k => k.includes('评级（成品级别）'));
    const raw = gradeKey ? String(g._rawData[gradeKey] || '') : String(g._rawData['_评级'] || '');
    if (!raw || raw === '0' || raw === '-') return 0;
    const grade = getGrade(raw);
    const order = { X: 7, SSS: 6, SS: 5, S: 4, A: 3, B: 2, C: 1 };
    const gv = grade ? (order[grade] || 0) : 0;
    const num = raw.match(/(\d+(?:\.\d+)?)/);
    return gv * 1000 + (num ? parseFloat(num[1]) : 0);
}
function parseCn(s) {
    const m = String(s).match(/(\d{4})年(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{1,2})/);
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime() : 0;
}

let games = [...liteGames];
games.sort((a, b) => sortVal(b) - sortVal(a));
console.log('=== 新 lite 评级排序 前8 ===');
games.slice(0, 8).forEach(g => console.log(' ', sortVal(g), '|', String(g._rawData['_评级'] || '').slice(0, 20).replace(/\n/g, ' '), '|', g.title.slice(0, 25)));

games.sort((a, b) => parseCn(b._rawData['_最后修改']) - parseCn(a._rawData['_最后修改']));
console.log('\n=== 新 lite 时间排序 前5 ===');
games.slice(0, 5).forEach(g => console.log(' ', g._rawData['_最后修改'], '|', g.title.slice(0, 25)));

// 体积
console.log('\n新 lite 大小:', Math.round(JSON.stringify({ games: liteGames }).length / 1024), 'KB（当前 2161KB）');
