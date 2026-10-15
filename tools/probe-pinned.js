// 探查置顶 id 在各数据文件中的存在性与标题
const fs = require('fs');
const path = require('path');
const SITE = 'D:/trae_project/网站与应用/gameapp/site';
const targets = [1090549665128984, 1792015519410.3167];

// 逐个文件流式扫描，不整文件 JSON.parse（games.json 有 6.7MB 且字段巨长）
function scanStream(file, idList) {
  const raw = fs.readFileSync(file, 'utf8');
  const hits = {};
  for (const id of idList) {
    const idx = raw.indexOf('"id":' + id);
    if (idx < 0) continue;
    // 从命中点往后取一段，找 title 与 文件ID
    const seg = raw.slice(idx, idx + 4000);
    const titleM = seg.match(/"title":"((?:[^"\\]|\\.)*)"/);
    const fidM = seg.match(/"文件ID":"((?:[^"\\]|\\.)*)"/);
    const updM = seg.match(/"updateDate":"([^"]*)"/);
    hits[id] = {
      title: titleM ? titleM[1] : '(no title in seg)',
      fileId: fidM ? fidM[1] : '',
      updateDate: updM ? updM[1] : ''
    };
  }
  return hits;
}

const files = [
  ['games.json', j => j],
  ['games-lite.json', j => j.games],
  ['collections.json', j => j.collections || j]
];
for (let i = 0; i <= 11; i++) files.push([`games-full/${i}.json`, j => j.games]);

for (const [f] of files) {
  const p = path.join(SITE, f);
  if (!fs.existsSync(p)) continue;
  let total = '?';
  try { total = JSON.parse(fs.readFileSync(p, 'utf8').slice(0, 200)).count; } catch (e) {}
  const hits = scanStream(p, targets);
  const marks = targets.map(t => `${t}:${hits[t] ? 'YES' : 'no'}`);
  console.log(`${f.padEnd(22)} count=${String(total).padStart(5)}  ${marks.join('  |  ')}`);
  for (const t of targets) {
    if (hits[t]) console.log(`    -> ${t} = ${hits[t].title}  [文件ID ${hits[t].fileId}] ${hits[t].updateDate}`);
  }
}
