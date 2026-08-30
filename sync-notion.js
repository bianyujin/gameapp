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
const crypto = require('crypto');

const TOKEN = process.env.NOTION_TOKEN;
const API_VERSION = '2025-09-03';
const GAMES_FILE = path.join(__dirname, 'games.json');
const COLLECTIONS_FILE = path.join(__dirname, 'collections.json');
const CONFIG_FILE = path.join(__dirname, 'config.json');
// 私有字段（搜索/FB/视频/版本及更新时间等）单独存放，由 /api/private-data 校验密码后返回
const PRIVATE_FILE = path.join(__dirname, 'functions', '_data', 'private-data.json');

// 主数据源：GAMEACG管理（galgame整理总表）→ games.json
const MAIN_SOURCE = { id: '308d9616-6621-8152-b20b-000b3217d5fc', name: 'GAMEACG管理' };
// 合集数据源：STU合集 → collections.json
const COLLECTION_SOURCE = { id: '318d9616-6621-803a-8feb-000b67b83a33', name: 'STU合集' };

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// 北京时间分钟级时间戳：YYYYMMDDHHMM
function beijingStamp() {
    const bj = new Date(Date.now() + 8 * 3600 * 1000);
    const pad = n => String(n).padStart(2, '0');
    return bj.getUTCFullYear() + pad(bj.getUTCMonth() + 1) + pad(bj.getUTCDate()) + pad(bj.getUTCHours()) + pad(bj.getUTCMinutes());
}

// 私有数据加密：AES-256-GCM，密钥 = SHA-256(ADMIN_KEY)，与 /api/private-data 的解密约定一致。
// 仓库里只保存密文（即使仓库公开也读不到内容），解密只发生在 Cloudflare 端。
function encryptPrivateData(obj, adminKey) {
    const iv = crypto.randomBytes(12);
    const key = crypto.createHash('sha256').update(String(adminKey), 'utf8').digest();
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ct = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
    return {
        v: 1,
        iv: iv.toString('base64'),
        // WebCrypto 的 AES-GCM 解密要求密文末尾附带 16 字节 auth tag
        data: Buffer.concat([ct, cipher.getAuthTag()]).toString('base64')
    };
}

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
    // 保留 Notion 元数据，用于生成稳定 id 和 updateDate
    row._notionPageId = page.id || '';
    row._notionLastEditedTime = page.last_edited_time || '';
    return row;
}

// 用 Notion page id (UUID) 生成稳定的数字 id，避免每次同步都变
function stableIdFromNotionPageId(notionPageId) {
    if (!notionPageId) return 0;
    const hex = notionPageId.replace(/-/g, '');
    // 取前 13 位 hex -> 52bit，小于 JS 安全整数上限(53bit)，不会舍入碰撞
    // （之前取 15 位=60bit 会舍入，导致不同页面可能生成相同 id）
    return parseInt(hex.slice(0, 13), 16) || 0;
}

// 字段映射（与 update.js 的 mapRowToGame 一致）
function findCol(headers, keyword) {
    return headers.findIndex(h => h.includes(keyword));
}

function mapRowToGame(row, headers, existingIds) {
    const get = (kw) => { const i = findCol(headers, kw); return i >= 0 ? (row[headers[i]] || '').trim() : ''; };

    // id：优先复用旧 id 保持稳定；没有旧 id 时按 Notion page id 生成稳定数字 id
    const stableId = row._notionPageId ? stableIdFromNotionPageId(row._notionPageId) : 0;
    const titleVal = (() => {
        for (const kw of ['游戏名', '游戏名称', '名称', '标题']) {
            const i = findCol(headers, kw);
            if (i >= 0 && (row[headers[i]] || '').trim()) return (row[headers[i]] || '').trim();
        }
        return '';
    })();
    const fid = (row['文件ID'] || '').trim() || titleVal;
    const game = {
        id: (existingIds && existingIds[fid]) || stableId || (Date.now() + Math.random()),
        icon: get('图标') || '🎮',
        category: '其他',
        // Notion「评分」字段为 0-100 制（成品级别得分），App 端用评级体系显示/排序，此处原样保留得分
        rating: parseFloat(get('评分')) || 0,
        downloads: get('下载量') || get('下载') || '-',
        description: '',
        updateDate: row._notionLastEditedTime ? new Date(row._notionLastEditedTime) : new Date(),
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
        return null; // 游戏名字段为空，跳过不上传
    }

    // 排雷/评价/攻略：Notion 已有此字段就直接用，否则合并排雷+攻略
    const existKey = headers.find(h => h.includes('排雷/评价/攻略'));
    if (existKey) {
        const val = (row[existKey] || '').trim();
        if (val) {
            game._rawData['排雷/评价/攻略'] = val;
            game._rawFields.push('排雷/评价/攻略');
        }
    } else {
        const paixLeiKey = headers.find(h => h.includes('排雷'));
        const gongLueKey = headers.find(h => h.includes('攻略'));
        const mergedVal = [paixLeiKey, gongLueKey].map(k => k ? (row[k] || '').trim() : '').filter(Boolean).join('\n');
        if (mergedVal) {
            game._rawData['排雷/评价/攻略'] = mergedVal;
            game._rawFields.push('排雷/评价/攻略');
        }
    }

    headers.forEach(h => {
        if (h === titleField || h === descriptionSource || h === categorySource) return; // 已映射字段不放入自定义字段
        if (h.includes('封面')) return; // 封面字段是图片，不显示
        if (h.includes('排雷') || h.includes('攻略')) return; // 已合并到"排雷/评价/攻略"
        if (h.startsWith('_')) return; // 内部元数据（_notionPageId、_notionLastEditedTime 等），不入用户字段
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
        if (res.status === 429 || res.status >= 500) {
            retryCount++;
            if (retryCount > 10) { console.log('  [' + dsName + '] 重试过多，跳过'); break; }
            console.log('  [' + dsName + '] ' + (res.status === 429 ? '速率限制' : '服务端错误 ' + res.status) + '，等待3秒重试...');
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
    const previewMap = {};
    const existingIds = {};
    for (const item of oldData) {
        const fid = (item._rawData && item._rawData['文件ID']) || item.title;
        if (fid && item.coverUrls) {
            coverMap[fid] = item.coverUrls;
            previewMap[fid] = (item._rawData && item._rawData['预览']) || '';
        }
        if (fid && item.id !== undefined) {
            existingIds[fid] = item.id;
        }
    }
    console.log('已缓存封面图: ' + Object.keys(coverMap).length + ' 个');
    console.log('已缓存稳定 id: ' + Object.keys(existingIds).length + ' 个');

    // 获取数据
    const pages = await queryDataSource(source.id, source.name);
    console.log('获取: ' + pages.length + ' 条');

    // 转换
    const newItems = [];
    let previewChangedCount = 0;
    for (const page of pages) {
        const row = notionPageToRow(page);
        const headers = Object.keys(row);
        const game = mapRowToGame(row, headers, existingIds);
        if (!game) continue; // 游戏名为空，跳过
        const fid = row['文件ID'] || game.title;
        const currentPreview = row['预览'] || '';
        // 预览链接没变才复用旧封面；变了就留空，让 extract-covers.js 重新提取
        if (fid && coverMap[fid] && previewMap[fid] === currentPreview) {
            game.coverUrls = coverMap[fid];
        } else if (fid && coverMap[fid] && previewMap[fid] !== currentPreview) {
            previewChangedCount++;
        }
        newItems.push(game);
    }

    // 去重 id：IndexedDB 以 id 为主键，重复 id 会导致记录互相覆盖丢失
    // （冲突来源：历史 Date.now id 被多个记录复用 / 稳定 id 舍入碰撞）
    const usedIds = new Set();
    for (const g of newItems) {
        if (usedIds.has(g.id)) {
            let nid;
            do { nid = Date.now() + Math.random(); } while (usedIds.has(nid));
            g.id = nid;
            console.log('  修正重复 id:', g.title && g.title.slice(0, 20));
        }
        usedIds.add(g.id);
    }

    const filtered = newItems; // 已在 mapRowToGame 里跳过无标题数据
    if (previewChangedCount > 0) {
        console.log('预览链接变化: ' + previewChangedCount + ' 个游戏将重新提取封面');
    }

    // 稳定性保护：拉取异常（空数据/数据量骤降）时拒绝覆盖，保留现有数据，避免 App 数据被清空
    if (filtered.length === 0 || (oldData.length > 50 && filtered.length < oldData.length * 0.6)) {
        console.log('  [' + label + '] ⚠️ 本次数据异常（新 ' + filtered.length + ' 条 / 旧 ' + oldData.length + ' 条），跳过写入，保留现有数据！');
        return { count: oldData.length, privateMap: null, aborted: true };
    }

    // 字段统一和排序：按固定顺序（文件ID→链接→备注→评价→预览→时间→DL号）
    const FIELD_ORDER = [
        '文件ID',
        '百度', '迅雷', 'UC', '夸克', '预览',
        '备注',
        '排雷/评价/攻略',
        '评级',
        '成品级别',
        '剧情',
        '画风',
        '游戏性',
        '内容cg',
        'CV质量',
        '修正分',
        '最后修改时间',
        '创建时间',
        'DL号'
    ];
    const allFields = new Set();
    filtered.forEach(g => g._rawFields && g._rawFields.forEach(f => allFields.add(f)));
    const sortedFields = Array.from(allFields).sort((a, b) => {
        const ka = FIELD_ORDER.findIndex(k => a.includes(k));
        const kb = FIELD_ORDER.findIndex(k => b.includes(k));
        const ia = ka >= 0 ? ka : 999;
        const ib = kb >= 0 ? kb : 999;
        return ia - ib;
    });
    filtered.forEach(g => {
        g._rawFields = [...sortedFields];
        sortedFields.forEach(f => { if (!g._rawData[f]) g._rawData[f] = ''; });
    });

    console.log('有效数据: ' + filtered.length + ' 条');

    // 私有字段拆分：公开的 games.json / collections.json 不再携带 privateData，
    // 私有数据（搜索/FB/视频/版本及更新时间等）集中写入 functions/_data/private-data.json，
    // 由 /api/private-data 校验管理员密钥后才返回
    const privateMap = {};
    for (const g of filtered) {
        if (g.privateData && Object.keys(g.privateData).length > 0) {
            privateMap[String(g.id)] = g.privateData;
        }
        delete g.privateData;
    }

    fs.writeFileSync(outputFile, JSON.stringify(filtered), 'utf-8');
    console.log('已写入 ' + path.basename(outputFile) + '（私有字段已拆分 ' + Object.keys(privateMap).length + ' 条）');
    return { count: filtered.length, privateMap: privateMap, aborted: false };
}

async function main() {
    if (!TOKEN) {
        console.error('错误：缺少 NOTION_TOKEN 环境变量');
        process.exit(1);
    }

    console.log('=== Notion 自动同步 ===');

    // 同步主数据
    const mainRes = await syncSource(MAIN_SOURCE, GAMES_FILE, '主数据(GAMEACG管理)');

    // 同步合集数据
    const collRes = await syncSource(COLLECTION_SOURCE, COLLECTIONS_FILE, '合集数据(STU合集)');

    // 写入私有数据文件（加密存储）；某个数据源异常跳过时沿用文件里原有的部分，避免私有数据丢失
    let existingPrivate = {};
    try { existingPrivate = JSON.parse(fs.readFileSync(PRIVATE_FILE, 'utf-8')); } catch(e) {}
    const privateOut = {
        generatedAt: beijingStamp(),
        games: mainRes.aborted ? (existingPrivate.games || {}) : mainRes.privateMap,
        collections: collRes.aborted ? (existingPrivate.collections || {}) : collRes.privateMap
    };
    if (!process.env.ADMIN_KEY) {
        // 没有加密密钥时绝不能写明文：保留仓库里现有的密文，私有数据维持上次同步内容
        console.log('\n⚠️ 未设置 ADMIN_KEY 环境变量，跳过私有数据更新（保留现有密文文件）');
    } else {
        try {
            fs.mkdirSync(path.dirname(PRIVATE_FILE), { recursive: true });
            const enc = encryptPrivateData(privateOut, process.env.ADMIN_KEY);
            fs.writeFileSync(PRIVATE_FILE, JSON.stringify(enc), 'utf-8');
            console.log('\n已写入加密 private-data.json（游戏 ' + Object.keys(privateOut.games).length + ' 条 / 合集 ' + Object.keys(privateOut.collections).length + ' 条）');
        } catch(e) { console.log('写入私有数据失败:', e.message); }
    }

    // 更新 config.json 版本号（北京时间，精确到分钟 YYYYMMDDHHMM）
    // 每次同步生成唯一版本号，App 端检测到版本变化即强制重新拉取，保证数据及时更新
    try {
        const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
        config.games_data_version = beijingStamp();
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
        console.log('\n已更新数据版本号: ' + config.games_data_version);
    } catch(e) { console.log('更新版本号失败:', e.message); }

    console.log('\n=== 同步完成 ===');
    console.log('主数据: ' + mainRes.count + ' 条');
    console.log('合集数据: ' + collRes.count + ' 条');
    console.log('\n（Git提交推送由GitHub Actions统一处理）');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
