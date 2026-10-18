// 决定性复现: lite 数据（games-lite.json）的 _rawData 只有 文件ID/类型/全文 三个键
// —— 没有评级字段！排序点击后 getGradeSortValue 对 lite 条目全部返回 0 → 顺序不变！
const fs = require('fs');
const path = require('path');
const lite = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'games-lite.json'), 'utf8'));
const sample = lite.games.slice(0, 3);
sample.forEach(g => {
    console.log('id:', g.id, '| _rawData keys:', Object.keys(g._rawData));
});
console.log('\n=> lite 条目 _rawData 无评级字段: getGradeSortValue 恒为 0');
console.log('=> _userSorted=true 后 render() 不重排，但 sortGames 排序本身全 0 等值 → 顺序不变');
console.log('=> 这就是"点击没效果"的根因（lite 数据下）');
console.log('\n修复方向: sortGames rating 时对 _lite 条目先 ensureFull，或从全文 blob 解析评级');
