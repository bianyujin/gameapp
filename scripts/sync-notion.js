/**
 * Notion → games.json 自动同步脚本
 * 
 * 环境变量:
 *   NOTION_TOKEN - Notion Integration Token
 *   NOTION_DATABASE_ID - Notion 数据库 ID
 * 
 * 用法: NOTION_TOKEN=xxx NOTION_DATABASE_ID=xxx node scripts/sync-notion.js
 */

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DB_ID = process.env.NOTION_DATABASE_ID;
const GAMES_FILE = path.join(__dirname, '..', 'games.json');

if (!NOTION_TOKEN || !NOTION_DB_ID) {
    console.error('请设置环境变量 NOTION_TOKEN 和 NOTION_DATABASE_ID');
    process.exit(1);
}

const HEADERS = {
    'Authorization': `Bearer ${NOTION_TOKEN}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json'
};

function getProp(props, names, type) {
    for (const name of names) {
        const p = props[name];
        if (!p) continue;
        switch (type) {
            case 'title': return p.title?.[0]?.plain_text || '';
            case 'rich_text': return p.rich_text?.[0]?.plain_text || '';
            case 'number': return p.number || 0;
            case 'select': return p.select?.name || '';
            case 'checkbox': return p.checkbox || false;
        }
    }
    return null;
}

function mapGameFields(game, pageId) {
    const internalFields = ['id', 'icon', 'category', 'rating', 'downloads', 'description', 'updateDate', 'isFavorite', '_rawFields', '_rawData', 'title', 'privateData', '_fieldMap'];
    const exactPrivateFields = ['搜索', '更新日志', 'FB', '视频'];
    const containsPrivateKeywords = ['版本及更新时间'];
    const isPrivateField = (key) => exactPrivateFields.includes(key) || containsPrivateKeywords.some(kw => key.includes(kw));

    const mapped = {
        id: pageId || Date.now() + Math.random(),
        icon: '🎮', category: '其他', rating: 0, downloads: '-',
        description: '', updateDate: new Date(), isFavorite: false,
        _rawFields: [], _rawData: {}, privateData: {}
    };

    const allData = {};
    Object.keys(game).forEach(key => {
        if (!internalFields.includes(key)) allData[key] = game[key];
    });

    for (const key in allData) {
        const value = allData[key];
        if (value === undefined || value === null) continue;
        const keyLower = key.toLowerCase().replace(/[\[\]（）\(\)\s|]/g, '');

        if (key === '类型' || key === '分类' || key === '类别') { if (value) mapped.category = value; continue; }
        if (keyLower.includes('游戏名') || key === '标题' || key === '游戏名称') { if (value && !mapped.title) mapped.title = value; continue; }
        if (key === '评分' || key === '分数') { const v = parseFloat(value); if (!isNaN(v)) mapped.rating = v; continue; }
        if (key === '下载量' || key === '下载') { if (value) mapped.downloads = value; continue; }
        if (key === '介绍' || key === '描述' || key === '简介') { if (value && !mapped.description) mapped.description = value; continue; }
        if (key === '图标') { if (value) mapped.icon = value; continue; }

        if (isPrivateField(key)) { mapped.privateData[key] = value; continue; }

        mapped._rawData[key] = value;
        if (!mapped._rawFields.includes(key)) mapped._rawFields.push(key);
    }

    if (!mapped.title) mapped.title = '未命名';
    return mapped;
}

async function fetchAllPages() {
    let allResults = [];
    let hasMore = true;
    let startCursor = undefined;

    while (hasMore) {
        const body = { page_size: 100 };
        if (startCursor) body.start_cursor = startCursor;

        const resp = await fetch(`https://api.notion.com/v1/databases/${NOTION_DB_ID}/query`, {
            method: 'POST', headers: HEADERS, body: JSON.stringify(body)
        });

        if (!resp.ok) throw new Error(`Notion API error: ${resp.status}`);
        const data = await resp.json();
        allResults = allResults.concat(data.results || []);
        hasMore = data.has_more;
        startCursor = data.next_cursor;
    }

    return allResults;
}

function transformPage(page) {
    const props = page.properties;
    const game = {};

    // 遍历所有属性，将 Notion 属性转为扁平 key-value
    for (const [key, prop] of Object.entries(props)) {
        switch (prop.type) {
            case 'title': game[key] = prop.title?.[0]?.plain_text || ''; break;
            case 'rich_text': game[key] = prop.rich_text?.[0]?.plain_text || ''; break;
            case 'number': game[key] = prop.number ?? ''; break;
            case 'select': game[key] = prop.select?.name || ''; break;
            case 'multi_select': game[key] = prop.multi_select?.map(s => s.name).join(', ') || ''; break;
            case 'checkbox': game[key] = prop.checkbox ? '是' : '否'; break;
            case 'date': game[key] = prop.date?.start || ''; break;
            case 'url': game[key] = prop.url || ''; break;
            case 'formula': game[key] = prop.formula?.string || prop.formula?.number?.toString() || ''; break;
            case 'rollup': game[key] = prop.rollup?.number?.toString() || prop.rollup?.array?.length?.toString() || ''; break;
            default: game[key] = '';
        }
    }

    return game;
}

async function main() {
    console.log('=== Notion → games.json 同步 ===');
    console.log(`数据库: ${NOTION_DB_ID}`);

    // 1. 读取现有 games.json（保留 coverUrls）
    let existingGames = [];
    try {
        existingGames = JSON.parse(fs.readFileSync(GAMES_FILE, 'utf-8'));
        console.log(`现有数据: ${existingGames.length} 条`);
    } catch(e) {
        console.log('无现有数据文件，将创建新文件');
    }

    // 构建 coverUrls 索引（按标题匹配）
    const coverIndex = {};
    existingGames.forEach(g => {
        if (g.coverUrls && g.coverUrls.length > 0 && g.title) {
            coverIndex[g.title] = g.coverUrls;
        }
    });
    console.log(`已有封面图: ${Object.keys(coverIndex).length} 个游戏`);

    // 2. 从 Notion 拉取数据
    console.log('正在从 Notion 获取数据...');
    const pages = await fetchAllPages();
    console.log(`获取到 ${pages.length} 条记录`);

    // 3. 转换
    const games = pages.map((page, i) => {
        const raw = transformPage(page);
        const mapped = mapGameFields(raw, page.id.replace(/-/g, ''));
        // 恢复已有的 coverUrls
        if (coverIndex[mapped.title]) {
            mapped.coverUrls = coverIndex[mapped.title];
        }
        return mapped;
    });

    // 4. 排序字段
    const allFieldsSet = new Set();
    games.forEach(g => g._rawFields?.forEach(f => allFieldsSet.add(f)));
    const globalFields = Array.from(allFieldsSet).sort((a, b) => a.localeCompare(b, 'zh-CN'));
    games.forEach(g => {
        g._rawFields = [...globalFields];
        globalFields.forEach(f => { if (!g._rawData.hasOwnProperty(f)) g._rawData[f] = ''; });
    });

    // 5. 写入
    fs.writeFileSync(GAMES_FILE, JSON.stringify(games, null, 2), 'utf-8');
    console.log(`已写入 ${games.length} 条数据到 games.json`);

    const withCover = games.filter(g => g.coverUrls && g.coverUrls.length > 0).length;
    console.log(`封面图覆盖: ${withCover}/${games.length}`);
    console.log('=== 同步完成 ===');
}

main().catch(e => { console.error('同步失败:', e.message); process.exit(1); });
