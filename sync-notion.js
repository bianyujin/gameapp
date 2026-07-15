/**
 * Notion 自动同步脚本
 * 从 Notion API 拉取数据，合并生成 games.json
 * 
 * 用法：node sync-notion.js
 * 环境变量：NOTION_TOKEN（Notion 集成 token）
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const TOKEN = process.env.NOTION_TOKEN;
const API_VERSION = '2025-09-03';
const GAMES_FILE = path.join(__dirname, 'games.json');
const CONFIG_FILE = path.join(__dirname, 'config.json');

// 只同步 GAMEACG管理（galgame整理总表）
// STU合集等其它表格不同步到主数据
const DATA_SOURCES = [
    { id: '308d9616-6621-8152-b20b-000b3217d5fc', name: 'GAMEACG管理' }
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function fetchNotion(url, body) {
    return new Promise((resolve, reject) => {
        const headers = {
            'Authorization': 'Bearer ' + TOKEN,
            'Notion-Version': API_VERSION,
            'Content-Type': 'application/json'
        };
        const req = https.request(url, { method: 'POST', headers }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, json: JSON.parse(data) }); }
                catch(e) { resolve({ status: res.statusCode, raw: data }); }
            });
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

function extractPropValue(prop) {
    if (!prop) return '';
    switch (prop.type) {
        case 'title': return (prop.title || []).map(t => t.plain_text).join('');
        case 'rich_text': return (prop.rich_text || []).map(t => t.plain_text).join('');
        case 'url': return prop.url || '';
        case 'select': return prop.select ? prop.select.name : '';
        case 'multi_select': return (prop.multi_select || []).map(s => s.name).join(', ');
        case 'number': return prop.number !== null ? String(prop.number) : '';
        case 'checkbox': return prop.checkbox ? '是' : '否';
        case 'date': return prop.date ? prop.date.start : '';
        case 'status': return prop.status ? prop.status.name : '';
        case 'created_time': return prop.created_time || '';
        case 'last_edited_time': return prop.last_edited_time || '';
        case 'files': return (prop.files || []).map(f => (f.file && f.file.url) || (f.external && f.external.url) || '').filter(Boolean).join('\n');
        default: return '';
    }
}

// 把 Notion 页面转换为跟 CSV 行数据一样的格式
function notionPageToRow(page) {
    const props = page.properties || {};
    const row = {};
    for (const key in props) {
        row[key] = extractPropValue(props[key]);
    }
    return row;
}

// 字段映射（与 update.js 的 mapRowToGame 一致）
function findCol(headers, keyword) {
    return headers.findIndex(h => h.includes(keyword));
}

function mapRowToGame(row, headers) {
    const get = (kw) => { const i = findCol(headers, kw); return i >= 0 ? (row[headers[i]] || '').trim() : ''; };

    const game = {
        id: Date.now() + Math.random(),
        icon: get('图标') || '🎮',
        category: get('类型') || get('分类') || '其他',
        rating: parseFloat(get('评分')) || 0,
        downloads: get('下载量') || get('下载') || '-',
        description: get('介绍') || get('描述') || '',
        updateDate: new Date(),
        isFavorite: false,
        _rawFields: [],
        _rawData: {},
        privateData: {},
        title: ''
    };

    const exactPrivateFields = ['搜索', '更新日志', 'FB', '视频'];
    const containsPrivateKeywords = ['版本及更新时间'];
    const isPrivateField = (key) => exactPrivateFields.includes(key) || containsPrivateKeywords.some(p => key.includes(p));

    const titleKw = ['游戏名', '游戏名称', '名称', '标题'];
    for (const kw of titleKw) { const v = get(kw); if (v) { game.title = v; break; } }
    if (!game.title) game.title = '未命名';

    headers.forEach(h => {
        const val = (row[h] || '').trim();
        if (val) {
            if (isPrivateField(h)) {
                game.privateData[h] = val;
            } else {
                game._rawData[h] = val;
            }
            if (!game._rawFields.includes(h)) game._rawFields.push(h);
        }
    });

    return game;
}

async function queryDataSource(dsId, dsName) {
    console.log('  [' + dsName + '] 开始获取...');
    let hasMore = true;
    let cursor = undefined;
    let allPages = [];
    let retryCount = 0;
    while (hasMore) {
        const body = JSON.stringify({ page_size: 100, start_cursor: cursor });
        const res = await fetchNotion('https://api.notion.com/v1/data_sources/' + dsId + '/query', body);
        if (res.status === 429) {
            retryCount++;
            if (retryCount > 10) { console.log('  [' + dsName + '] 速率限制重试过多，跳过'); break; }
            console.log('  [' + dsName + '] 速率限制，等待3秒...');
            await sleep(3000);
            continue;
        }
        retryCount = 0;
        if (res.status !== 200) {
            console.log('  [' + dsName + '] 查询失败:', res.status, res.json && res.json.message);
            break;
        }
        allPages = allPages.concat(res.json.results);
        hasMore = res.json.has_more;
        cursor = res.json.next_cursor;
        console.log('  [' + dsName + '] 已获取 ' + allPages.length + ' 条' + (hasMore ? ' (继续...)' : ' (完成)'));
        await sleep(400);
    }
    return allPages;
}

async function main() {
    if (!TOKEN) {
        console.error('错误：缺少 NOTION_TOKEN 环境变量');
        process.exit(1);
    }

    console.log('=== Notion 自动同步 ===\n');

    // 读取现有 games.json（保留封面图）
    let oldGames = [];
    try {
        oldGames = JSON.parse(fs.readFileSync(GAMES_FILE, 'utf-8'));
        console.log('现有数据: ' + oldGames.length + ' 条');
    } catch(e) {
        console.log('无现有数据，全新创建');
    }

    // 建立 文件ID → coverUrls 映射（保留封面图）
    const coverMap = {};
    for (const game of oldGames) {
        const fid = (game._rawData && game._rawData['文件ID']) || game.title;
        if (fid && game.coverUrls) {
            coverMap[fid] = game.coverUrls;
        }
    }
    console.log('已缓存封面图: ' + Object.keys(coverMap).length + ' 个游戏\n');

    // 串行获取4个数据源（避免速率限制）
    console.log('正在从 Notion 获取数据...');
    let allPages = [];
    for (const ds of DATA_SOURCES) {
        const pages = await queryDataSource(ds.id, ds.name);
        allPages = allPages.concat(pages);
    }
    console.log('\n总共获取: ' + allPages.length + ' 条\n');

    // 转换为 game 对象
    const newGames = [];
    for (const page of allPages) {
        const row = notionPageToRow(page);
        const headers = Object.keys(row);
        const game = mapRowToGame(row, headers);

        // 用文件ID匹配保留封面图
        const fid = row['文件ID'] || game.title;
        if (fid && coverMap[fid]) {
            game.coverUrls = coverMap[fid];
        }

        newGames.push(game);
    }

    // 过滤掉没有文件ID的空行
    const filtered = newGames.filter(g => {
        const fid = g._rawData && g._rawData['文件ID'];
        return fid && fid.trim();
    });

    console.log('有效数据: ' + filtered.length + ' 条');

    // 写入 games.json
    fs.writeFileSync(GAMES_FILE, JSON.stringify(filtered, null, 2), 'utf-8');
    console.log('已写入 games.json');

    // 更新 config.json 版本号
    try {
        const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
        const today = new Date();
        const y = today.getFullYear();
        const m = String(today.getMonth() + 1).padStart(2, '0');
        const d = String(today.getDate()).padStart(2, '0');
        config.games_data_version = y + m + d;
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config), 'utf-8');
        console.log('已更新数据版本号: ' + config.games_data_version);
    } catch(e) {}

    // Git 提交推送
    console.log('\n正在提交推送...');
    try {
        execSync('git add games.json config.json', { cwd: __dirname, stdio: 'pipe' });
        execSync('git commit -m "Notion自动同步: ' + filtered.length + '条数据"', { cwd: __dirname, stdio: 'pipe' });
        execSync('git push origin main', { cwd: __dirname, stdio: 'pipe' });
        console.log('✅ 推送成功！');
    } catch(e) {
        console.log('⚠️ Git操作失败，数据已更新到本地');
        console.log('   请手动执行: git push origin main');
    }

    console.log('\n=== 同步完成 ===');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
