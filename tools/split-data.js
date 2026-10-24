#!/usr/bin/env node
/**
 * 把 games.json 拆分为"轻索引 + 详情分块"两级数据，缩小首次同步体积。
 *
 * 产物（写在仓库根目录，随 Cloudflare Pages 部署）：
 *   games-lite.json     列表/搜索/筛选所需的轻索引（含 coverUrls 与全文搜索 blob）
 *   games-full/{n}.json 完整记录分块（每块 CHUNK 条），详情页按需加载
 *
 * 兼容性：games.json 原样保留，旧版前端/失败回退都走它。
 * 用法：node tools/split-data.js [games.json路径] [输出目录]
 * sync-notion.js 每次同步后自动调用。
 */
const fs = require('fs');
const path = require('path');

const CHUNK = 150;

function splitGames(gamesFile, outDir) {
    gamesFile = gamesFile || path.join(__dirname, '..', 'games.json');
    outDir = outDir || path.join(__dirname, '..');

    const games = JSON.parse(fs.readFileSync(gamesFile, 'utf-8'));
    let version = '';
    try {
        version = JSON.parse(fs.readFileSync(path.join(outDir, 'config.json'), 'utf-8')).games_data_version || '';
    } catch (e) { /* 版本号可选 */ }

    // 全量字段名（所有游戏共享同一套 Notion 列），头部级存储省掉每条一份
    const fields = [];
    const seen = new Set();
    games.forEach(g => {
        (g._rawFields || []).forEach(f => { if (!seen.has(f)) { seen.add(f); fields.push(f); } });
    });

    const fullDir = path.join(outDir, 'games-full');
    fs.mkdirSync(fullDir, { recursive: true });
    // 清掉旧分块，避免条数减少后残留过期数据
    fs.readdirSync(fullDir).forEach(f => { if (f.endsWith('.json')) fs.unlinkSync(path.join(fullDir, f)); });

    const liteGames = [];
    const v3Games = [];
    const chunkFiles = new Map();

    games.forEach((g, i) => {
        const chunkIdx = Math.floor(i / CHUNK);
        const rd = g._rawData || {};
        // 全文搜索 blob：与前端 getFilteredGames 对 _rawData 全值的 includes 匹配保持一致
        const blob = Object.values(rd).filter(v => typeof v === 'string').join('\n');
        // 排序字段（评级/最后修改/创建）显式进 lite：前端排序按钮直接可用，不用拉详情分块
        const gradeKey = Object.keys(rd).find(k => k.includes('评级'));
        liteGames.push({
            id: g.id,
            title: g.title,
            icon: g.icon,
            category: g.category,
            rating: g.rating,
            downloads: g.downloads,
            updateDate: g.updateDate,
            isFavorite: g.isFavorite,
            coverUrls: g.coverUrls || [],
            _rawData: {
                '文件ID': rd['文件ID'] || '',
                '类型': rd['类型'] || '',
                '全文': blob,
                '_评级': gradeKey ? (rd[gradeKey] || '') : '',
                '_最后修改': rd['最后修改时间'] || '',
                '_创建': rd['创建时间'] || ''
            },
            _c: chunkIdx
        });
        // v3 专用更轻的索引（games-v3.json）：不带全文 blob（v3 搜索只用 title/fid/category）、
        // 封面只留前 2 张（卡片轮换够用，详情预览图走 games-full），其余同 lite。
        // v2 旧前端继续读 games-lite.json，互不影响。
        v3Games.push({
            id: g.id,
            title: g.title,
            icon: g.icon,
            category: g.category,
            rating: g.rating,
            updateDate: g.updateDate,
            coverUrls: (g.coverUrls || []).slice(0, 2),
            _rawData: {
                '文件ID': rd['文件ID'] || '',
                '_评级': gradeKey ? (rd[gradeKey] || '') : '',
                '_最后修改': rd['最后修改时间'] || ''
            },
            _c: chunkIdx
        });
        if (!chunkFiles.has(chunkIdx)) {
            chunkFiles.set(chunkIdx, []);
        }
        chunkFiles.get(chunkIdx).push(g);
    });

    chunkFiles.forEach((chunkGames, idx) => {
        fs.writeFileSync(
            path.join(fullDir, idx + '.json'),
            JSON.stringify({ v: version, games: chunkGames }),
            'utf-8'
        );
    });

    const lite = { v: version, count: games.length, fields, games: liteGames };
    fs.writeFileSync(path.join(outDir, 'games-lite.json'), JSON.stringify(lite), 'utf-8');

    const v3 = { v: version, count: games.length, games: v3Games };
    fs.writeFileSync(path.join(outDir, 'games-v3.json'), JSON.stringify(v3), 'utf-8');

    const mb = b => (b / 1024 / 1024).toFixed(2) + 'MB';
    const kb = b => (b / 1024).toFixed(0) + 'KB';
    const liteSize = fs.statSync(path.join(outDir, 'games-lite.json')).size;
    const v3Size = fs.statSync(path.join(outDir, 'games-v3.json')).size;
    let chunkSize = 0;
    chunkFiles.forEach((_, idx) => { chunkSize += fs.statSync(path.join(fullDir, idx + '.json')).size; });
    console.log(`[split] games=${games.length} 版本=${version || '无'}`);
    console.log(`[split] games-lite.json: ${kb(liteSize)}（原 games.json: ${mb(fs.statSync(gamesFile).size)}）`);
    console.log(`[split] games-v3.json: ${kb(v3Size)}（v3 专用轻索引）`);
    console.log(`[split] games-full: ${chunkFiles.size} 块, 共 ${mb(chunkSize)}`);
}

module.exports = { splitGames, CHUNK };

if (require.main === module) {
    splitGames(process.argv[2], process.argv[3]);
}
