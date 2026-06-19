/**
 * 一键更新脚本
 * 
 * 用法:
 *   node update.js [csv文件名] [选项]
 * 
 * 选项:
 *   --no-covers    跳过封面图提取（只更新数据）
 *   --force-covers 强制重新提取所有封面图（包括已有的）
 * 
 * 示例:
 *   node update.js mydata.csv                # 更新数据+提取新封面图
 *   node update.js mydata.csv --no-covers    # 只更新数据，不提取封面
 *   node update.js --force-covers            # 用最新CSV+强制重新提取所有封面
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = __dirname;
const GAMES_FILE = path.join(ROOT, 'games.json');

// ========== CSV 解析（无需外部依赖）==========
function parseCsvLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') { if (inQuotes && line[i+1] === '"') { current += '"'; i++; } else { inQuotes = !inQuotes; } }
        else if (c === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
        else { current += c; }
    }
    result.push(current.trim());
    return result;
}

function parseCsv(content) {
    const lines = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < content.length; i++) {
        const c = content[i];
        if (c === '"') inQuotes = !inQuotes;
        if ((c === '\n' || c === '\r') && !inQuotes) {
            if (current.trim()) lines.push(current);
            current = '';
            if (c === '\r' && content[i+1] === '\n') i++;
        } else { current += c; }
    }
    if (current.trim()) lines.push(current);
    if (lines.length < 2) return { headers: [], rows: [] };
    const headers = parseCsvLine(lines[0]);
    const rows = lines.slice(1).map(l => parseCsvLine(l));
    return { headers, rows };
}

function findCol(headers, keyword) {
    return headers.findIndex(h => h.includes(keyword));
}

// ========== 字段映射 ==========
function mapRowToGame(row, headers) {
    const get = (kw) => { const i = findCol(headers, kw); return i >= 0 ? (row[i] || '').trim() : ''; };

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
        title: ''
    };

    // 找标题
    const titleKw = ['游戏名', '游戏名称', '名称', '标题'];
    for (const kw of titleKw) { const v = get(kw); if (v) { game.title = v; break; } }
    if (!game.title) game.title = '未命名';

    // 所有字段存入 _rawData
    headers.forEach((h, i) => {
        const val = (row[i] || '').trim();
        if (val) {
            game._rawData[h] = val;
            if (!game._rawFields.includes(h)) game._rawFields.push(h);
        }
    });

    return game;
}

// ========== 主流程 ==========
async function main() {
    console.log('=== GAMEACG 一键更新 ===\n');

    // 解析参数
    const args = process.argv.slice(2);
    const noCovers = args.includes('--no-covers');
    const forceCovers = args.includes('--force-covers');
    const csvArg = args.find(a => !a.startsWith('--'));

    if (noCovers) console.log('📌 模式: 跳过封面图提取');
    if (forceCovers) console.log('📌 模式: 强制重新提取所有封面图');

    // 1. 查找 CSV 文件
    let csvPath = csvArg;
    if (!csvPath) {
        // 自动查找最新的 CSV 文件
        const csvFiles = fs.readdirSync(ROOT)
            .filter(f => f.endsWith('.csv'))
            .map(f => ({ name: f, time: fs.statSync(path.join(ROOT, f)).mtimeMs }))
            .sort((a, b) => b.time - a.time);
        if (csvFiles.length > 0) {
            csvPath = csvFiles[0].name;
            console.log(`自动找到CSV: ${csvPath}`);
        }
    }

    if (!csvPath || !fs.existsSync(csvPath)) {
        console.error('❌ 未找到CSV文件');
        console.error('   请把Notion导出的CSV文件放到仓库根目录');
        console.error('   然后运行: node update.js <csv文件名>');
        process.exit(1);
    }

    // 2. 读取并解析 CSV
    console.log(`读取CSV: ${csvPath}`);
    let content = fs.readFileSync(csvPath, 'utf-8');
    // 处理 BOM
    if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
    const { headers, rows } = parseCsv(content);
    console.log(`列数: ${headers.length}, 行数: ${rows.length}`);
    console.log(`列名: ${headers.slice(0, 8).join(', ')}...`);

    // 3. 读取现有 games.json（保留 coverUrls）
    let existingGames = [];
    try {
        existingGames = JSON.parse(fs.readFileSync(GAMES_FILE, 'utf-8'));
        console.log(`现有数据: ${existingGames.length} 条`);
    } catch(e) {
        console.log('无现有数据');
    }
    const coverIndex = {};
    existingGames.forEach(g => {
        if (g.coverUrls?.length > 0 && g.title) coverIndex[g.title] = g.coverUrls;
    });

    // 4. 转换
    const games = rows.map(row => {
        const game = mapRowToGame(row, headers);
        // 恢复封面图
        if (coverIndex[game.title]) game.coverUrls = coverIndex[game.title];
        return game;
    }).filter(g => g.title !== '未命名');

    // 5. 排序字段
    const allFields = new Set();
    games.forEach(g => g._rawFields?.forEach(f => allFields.add(f)));
    const sortedFields = Array.from(allFields).sort((a, b) => a.localeCompare(b, 'zh-CN'));
    games.forEach(g => {
        g._rawFields = [...sortedFields];
        sortedFields.forEach(f => { if (!g._rawData[f]) g._rawData[f] = ''; });
    });

    // 6. 写入 games.json
    fs.writeFileSync(GAMES_FILE, JSON.stringify(games, null, 2), 'utf-8');
    console.log(`\n✅ 已写入 ${games.length} 条数据到 games.json`);

    // 7. 提取封面图
    if (noCovers) {
        console.log('\n⏭️  跳过封面图提取');
    } else {
        console.log('\n正在提取封面图...');
        const coverCmd = forceCovers ? 'node extract-covers.js --force' : 'node extract-covers.js';
        try {
            execSync(coverCmd, { cwd: ROOT, stdio: 'inherit' });
        } catch(e) {
            console.log('封面图提取跳过（可稍后单独运行）');
        }
    }

    // 8. Git 操作
    console.log('\n正在提交...');
    try {
        execSync('git add games.json', { cwd: ROOT, stdio: 'pipe' });
        const diff = execSync('git diff --cached --quiet games.json', { cwd: ROOT }).toString().trim();
        if (diff === '') {
            console.log('数据无变化，跳过提交');
        } else {
            execSync(`git commit -m "update: 数据更新 ${new Date().toISOString().split('T')[0]}"`, { cwd: ROOT, stdio: 'pipe' });
            console.log('正在推送到GitHub...');
            execSync('git push', { cwd: ROOT, stdio: 'pipe' });
            console.log('✅ 推送成功！');
        }
    } catch(e) {
        console.log('⚠️  Git操作失败，数据已更新到本地，请手动push');
    }

    console.log('\n=== 更新完成 ===');
}

main().catch(e => { console.error('❌ 更新失败:', e.message); process.exit(1); });
