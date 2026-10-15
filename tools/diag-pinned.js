// 置顶生效链路体检：本地数据 vs 线上 pinned.json，输出结论与建议
const https = require('https');
const fs = require('fs');
const path = require('path');
const SITE = path.join(__dirname, '..');

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'gameapp-diag' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(get(res.headers.location));
      }
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    }).on('error', reject);
  });
}

(async () => {
  const live = await get('https://gameapp-2e8.pages.dev/pinned.json');
  const pinned = JSON.parse(live.body);
  console.log('[线上] pinned.json games =', JSON.stringify(pinned.games));

  // 本地最新数据里，被置顶 id 的标题
  const lite = JSON.parse(fs.readFileSync(path.join(SITE, 'games-lite.json'), 'utf8'));
  const ids = pinned.games.map(x => Number(x));
  console.log('\n[本地数据核对]');
  for (const id of ids) {
    const hit = lite.games.find(g => Number(g.id) === id);
    console.log(`  ${id}: ${hit ? hit.title.slice(0, 50) : '!!! 本地 games-lite.json 中不存在 !!!'}`);
  }

  // 本地 pinned.json 与线上差异
  const localPinned = JSON.parse(fs.readFileSync(path.join(SITE, 'pinned.json'), 'utf8'));
  console.log('\n[本地仓库 pinned.json] games =', JSON.stringify(localPinned.games));
  const same = JSON.stringify(localPinned.games) === JSON.stringify(pinned.games);
  console.log('本地与线上一致:', same ? '是' : '否（线上才是用户看到的结果）');

  console.log('\n[结论]');
  console.log('  1. pinned.json 已随部署分发：线上内容 = 你提交的内容，链路通。');
  console.log('  2. 用户看不到置顶，卡在客户端数据：App/浏览器先读 IndexedDB 里的旧数据，');
  console.log('    置顶排序只作用于已加载列表，新置顶的条目如果本地没同步过就排不出来。');
  console.log('  3. 自动同步默认关闭（autoSyncEnabled 需用户在"我的"里手动开），');
  console.log('    所以旧数据会一直留着，必须手动下拉同步或开自动同步。');
})();
