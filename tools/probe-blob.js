// 从「全文」blob 提取评级与时间的模式验证
// blob 结构 = Object.values(_rawData).join('\n')，字段顺序 = _rawFields 顺序
const fs = require('fs');
const lite = JSON.parse(fs.readFileSync('games-lite.json', 'utf8'));

// blob 是按 _rawFields 顺序 join 的。lite 的 _rawData['全文'] 包含所有字段值
// split-data.js L47: blob = Object.values(rd).filter(v=>typeof v==='string').join('\n')
// games.json 的 _rawData 键顺序 = _rawFields 顺序（sync-notion.js normalize 保证）
// 所以 blob 的行序 = 字段值顺序。无法可靠定位"哪一行是评级"——除非按值特征匹配。

// 评级特征: 行以 (X|SSS|SS|S|A|B|C) 开头，后面跟可选数字，长度短
// 时间特征: \d{4}年\d{1,2}月\d{1,2}日

let ok = 0, fail = 0;
for (const g of lite.games) {
    const blob = String(g._rawData['全文'] || '');
    // 找"最后修改时间"——blob 中第一个日期行
    const timeM = blob.match(/(\d{4})年(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{1,2})/);
    // 找评级: 独立行或带注释，如 "S 70" / "SS" / "SS精品..."
    const gradeM = blob.match(/(?:^|\n)(X(?:\s+\d+)?|SSS(?:\s+\d+)?|SS(?:\s+\d+)?|S(?:\s+\d+)?|A(?:\s+\d+)?|B(?:\s+\d+)?|C(?:\s+\d+)?)(?=\n|$)/m);
    if (gradeM && timeM) ok++;
    else fail++;
}
console.log('可解析: ' + ok + ' / 不可解析: ' + fail);
// 抽 3 个样例看抓到的值
let shown = 0;
for (const g of lite.games) {
    if (shown >= 3) break;
    const blob = String(g._rawData['全文'] || '');
    const gradeM = blob.match(/(?:^|\n)(X(?:\s+\d+)?|SSS(?:\s+\d+)?|SS(?:\s+\d+)?|S(?:\s+\d+)?|A(?:\s+\d+)?|B(?:\s+\d+)?|C(?:\s+\d+)?)(?=\n|$)/m);
    const timeM = blob.match(/(\d{4})年(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{1,2})/);
    if (gradeM) {
        shown++;
        console.log(g.id, '| grade:', JSON.stringify(gradeM[1]), '| time:', timeM ? timeM[0] : '(none)', '| title:', g.title.slice(0, 25));
    }
}
