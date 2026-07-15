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

const TOKEN = process.env.NOTION_TOKEN;
const API_VERSION = '2025-09-03';
const GAMES_FILE = path.join(__dirname, 'games.json');
const COLLECTIONS_FILE = path.join(__dirname, 'collections.json');
const CONFIG_FILE = path.join(__dirname, 'config.json');

// 主数据源：GAMEACG管理（galgame整理总表）→ games.json
const MAIN_SOURCE = { id: '308d9616-6621-8152-b20b-000b3217d5fc', name: 'GAMEACG管理' };
// 合集数据源：STU合集 → collections.json
const COLLECTION_SOURCE = { id: '318d9616-6621-803a-8feb-000b67b83a33', name: 'STU合集' };

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

// Notion ISO 时间转中文格式（北京时间）：2026-07-15T13:17:00.000Z → 2026年7月15日 21:17
function formatNotionDate(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '';
    // 转北京时间（UTC+8）
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    const beijing = new Date(utc + 8 * 3600000);
    const y = beijing.getFullYear();
    const m = beijing.getMonth() + 1;
    const day = beijing.getDate();
    const h = String(beijing.getHours()).padStart(2, '0');
    const min = String(beijing.getMinutes()).padStart(2, '0');
    return y + '年' + m + '月' + day + '日 ' + h + ':' + min;
}

// 需要忽略的字段（以前 CSV 数据里没有这些，保持一致）
const IGNORED_FIELDS = ['引擎'];

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
        case 'created_time': return formatNotionDate(prop.created_time);
        case 'last_edited_time': return formatNotionDate(prop.last_edited_time);
        case 'files': return (prop.files || []).map(f => (f.file && f.file.url) || (f.external && f.external.url) || '').filter(Boolean).join('\n');
        default: return '';
    }
}

// 把 Notion 页面转换为跟 CSV 行数据一样的格式
function notionPageToRow(page) {
    const props = page.properties || {};
    const row = {};
    for (const key in props) {
        if (IGNORED_FIELDS.includes(key)) continue;
        if (key.includes('\uFFFD')) continue; // 过滤乱码字段名（Notion API 偶发返回重复的乱码版字段）
        row[key] = extractPropValue(props[key]);
    }
    return row;
}

// 字段映射（与 update.js 的 mapRowToGame 一致）
function findCol(headers, keyword) {
    return headers.findIndex(h => h.includes(keyword));
}

// 字段排序优先级（数字越小越靠前，主表和合集共用统一顺序）
function getFieldSortKey(field) {
    if (field.includes('文件ID')) return 1;
    if (field.includes('搜索')) return 2;
    if (field.includes('排雷')) return 3;
    if (field.includes('成品级别')) return 4;
    if (field === '评级') return 5;
    if (field.includes('类型')) return 6;
    if (field.includes('剧情')) return 7;
    if (field.includes('画风')) return 8;
    if (field.includes('游戏性')) return 9;
    if (field.toLowerCase().includes('内容cg')) return 10;
    if (field.toUpperCase().includes('CV质量')) return 11;
    if (field.includes('修正分')) return 12;
    if (field.includes('备注')) return 13;
    if (field.includes('攻略')) return 14;
    if (field.includes('更新日志')) return 15;
    if (field.includes('预览')) return 16;
    if (field.includes('封面')) return 17;
    if (field.includes('百度') || field.includes('度盘')) return 18;
    if (field.includes('夸克')) return 19;
    if (field.includes('迅雷')) return 20;
    if (field.includes('UC')) return 21;
    if (field === 'FB') return 22;
    if (field.includes('视频')) return 23;
    if (field.includes('版本及更新时间')) return 24;
    if (field.includes('游戏名')) return 25;
    if (field.includes('最后修改时间')) return 26;
    if (field.includes('创建时间')) return 27;
    if (field.includes('DL号')) return 28;
    if (field.includes('引擎')) return 29;
    return 100;
}

function mapRowToGame(row, headers) {
    const get = (kw) => { const i = findCol(headers, kw); return i >= 0 ? (row[headers[i]] || '').trim() : ''; };

    const game = {
        id: Date.now() + Math.random(),
        icon: get('图标') || '🎮',
        category: '其他',
        rating: parseFloat(get('评分')) || 0,
        downloads: get('下载量') || get('下载') || '-',
        description: '',
        updateDate: new Date(),
        isFavorite: false,
        _rawFields: [],
        _rawData: {},
        privateData: {},
        title: ''
    };

    // 描述来源：介绍 > 描述 > 更新日志（已用作描述的字段不再放入自定义字段）
    const descKw = ['介绍', '描述', '更新日志'];
    let descriptionSource = '';
    for (const kw of descKw) {
        const i = findCol(headers, kw);
        if (i >= 0 && (row[headers[i]] || '').trim()) {
            game.description = (row[headers[i]] || '').trim();
            descriptionSource = headers[i];
            break;
        }
    }

    // 分类来源：类型 > 分类（已用作分类的字段不再放入自定义字段）
    const categoryKw = ['类型', '分类'];
    let categorySource = '';
    for (const kw of categoryKw) {
        const i = findCol(headers, kw);
        if (i >= 0 && (row[headers[i]] || '').trim()) {
            game.category = (row[headers[i]] || '').trim();
            categorySource = headers[i];
            break;
        }
    }

    const exactPrivateFields = ['搜索', 'FB', '视频'];
    const containsPrivateKeywords = ['版本及更新时间'];
    const isPrivateField = (key) => exactPrivateFields.includes(key) || containsPrivateKeywords.some(p => key.includes(p));

    const titleKw = ['游戏名', '游戏名称', '名称', '标题'];
    let titleField = '';
    for (const kw of titleKw) {
        const i = findCol(headers, kw);
        if (i >= 0 && (row[headers[i]] || '').trim()) { titleField = headers[i]; break; }
    }
    if (titleField) {
        game.title = (row[titleField] || '').trim();
    } else {
        game.title = get('文件ID') || '未命名';
    }

    headers.forEach(h => {
        if (h === titleField || h === descriptionSource || h === categorySource) return; // 已映射字段不放入自定义字段
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

// 同步单个数据源到指定文件
async function syncSource(source, outputFile, label) {
    console.log('\n--- ' + label + ' ---');

    // 读取现有数据（保留封面图）
    let oldData = [];
    try {
        oldData = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
        console.log('现有数据: ' + oldData.length + ' 条');
    } catch(e) {}

    const coverMap = {};
    for (const item of oldData) {
        const fid = (item._rawData && item._rawData['文件ID']) || item.title;
        if (fid && item.coverUrls) {
            coverMap[fid] = item.coverUrls;
        }
    }
    console.log('已缓存封面图: ' + Object.keys(coverMap).length + ' 个');

    // 获取数据
    const pages = await queryDataSource(source.id, source.name);
    console.log('获取: ' + pages.length + ' 条');

    // 转换
    const newItems = [];
    for (const page of pages) {
        const row = notionPageToRow(page);
        const headers = Object.keys(row);
        const game = mapRowToGame(row, headers);
        const fid = row['文件ID'] || game.title;
        if (fid && coverMap[fid]) {
            game.coverUrls = coverMap[fid];
        }
        newItems.push(game);
    }

    // 过滤未命名
    const filtered = newItems.filter(g => g.title !== '未命名');

    // 字段统一和排序（主表和合集共用统一顺序）
    const allFields = new Set();
    filtered.forEach(g => g._rawFields && g._rawFields.forEach(f => allFields.add(f)));
    const sortedFields = Array.from(allFields).sort((a, b) => {
        const ka = getFieldSortKey(a);
        const kb = getFieldSortKey(b);
        if (ka !== kb) return ka - kb;
        return a.localeCompare(b, 'zh-CN');
    });
    filtered.forEach(g => {
        g._rawFields = [...sortedFields];
        sortedFields.forEach(f => { if (!g._rawData[f]) g._rawData[f] = ''; });
    });

    console.log('有效数据: ' + filtered.length + ' 条');
    fs.writeFileSync(outputFile, JSON.stringify(filtered, null, 2), 'utf-8');
    console.log('已写入 ' + path.basename(outputFile));
    return filtered.length;
}

async function main() {
    if (!TOKEN) {
        console.error('错误：缺少 NOTION_TOKEN 环境变量');
        process.exit(1);
    }

    console.log('=== Notion 自动同步 ===');

    // 同步主数据
    const mainCount = await syncSource(MAIN_SOURCE, GAMES_FILE, '主数据(GAMEACG管理)');

    // 同步合集数据
    const collCount = await syncSource(COLLECTION_SOURCE, COLLECTIONS_FILE, '合集数据(STU合集)');

    // 更新 config.json 版本号
    try {
        const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
        const today = new Date();
        const y = today.getFullYear();
        const m = String(today.getMonth() + 1).padStart(2, '0');
        const d = String(today.getDate()).padStart(2, '0');
        config.games_data_version = y + m + d;
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config), 'utf-8');
        console.log('\n已更新数据版本号: ' + config.games_data_version);
    } catch(e) {}

    console.log('\n=== 同步完成 ===');
    console.log('主数据: ' + mainCount + ' 条');
    console.log('合集数据: ' + collCount + ' 条');
    console.log('\n（Git提交推送由GitHub Actions统一处理）');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
