/**
 * 一键更新脚本
 *
 * 用法:
 *   node update.js [CSV目录或文件] [选项]
 *
 * 选项:
 *   --no-covers    跳过封面图提取（只更新数据）
 *   --force-covers 强制重新提取所有封面图（包括已有的）
 *
 * 默认行为:
 *   - 读取CSV更新 games.json
 *   - 保留已有封面图，只提取没有封面图的游戏
 *   - 自动过滤二维码图片
 *   - 自动更新 config.json 数据版本号
 *   - 自动提交并推送到 GitHub
 *
 * 示例:
 *   node update.js "D:\备份\260713"           # 指定目录，自动找 _all.csv
 *   node update.js mydata.csv                 # 指定CSV文件
 *   node update.js                            # 自动查找仓库根目录CSV
 *   node update.js "D:\备份\260713" --no-covers    # 只更新数据，不提取封面
 *   node update.js "D:\备份\260713" --force-covers  # 强制重新提取所有封面
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
        privateData: {},
        title: ''
    };

    const exactPrivateFields = ['搜索', '更新日志', 'FB', '视频'];
    const containsPrivateKeywords = ['版本及更新时间'];
    const isPrivateField = (key) => exactPrivateFields.includes(key) || containsPrivateKeywords.some(p => key.includes(p));

    // 找标题
    const titleKw = ['游戏名', '游戏名称', '名称', '标题'];
    for (const kw of titleKw) { const v = get(kw); if (v) { game.title = v; break; } }
    if (!game.title) game.title = '未命名';

    // 所有字段存入 _rawData 或 privateData
    headers.forEach((h, i) => {
        const val = (row[i] || '').trim();
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
    if (csvPath && fs.existsSync(csvPath) && fs.statSync(csvPath).isDirectory()) {
        // 参数是目录：查找该目录下最新的 GAMEACG _all.csv
        const csvFiles = fs.readdirSync(csvPath)
            .filter(f => f.endsWith('_all.csv') && f.includes('GAMEACG'))
            .map(f => ({ name: path.join(csvPath, f), time: fs.statSync(path.join(csvPath, f)).mtimeMs }))
            .sort((a, b) => b.time - a.time);
        if (csvFiles.length > 0) {
            csvPath = csvFiles[0].name;
            console.log(`目录中找到CSV: ${path.basename(csvPath)}`);
        } else {
            // 回退：查找目录下任意 csv
            const anyCsv = fs.readdirSync(csvPath)
                .filter(f => f.endsWith('.csv'))
                .map(f => ({ name: path.join(csvPath, f), time: fs.statSync(path.join(csvPath, f)).mtimeMs }))
                .sort((a, b) => b.time - a.time);
            if (anyCsv.length > 0) {
                csvPath = anyCsv[0].name;
                console.log(`目录中找到CSV: ${path.basename(csvPath)}`);
            }
        }
    } else if (!csvPath) {
        // 自动查找仓库根目录的 CSV
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
        console.error('   用法:');
        console.error('   node update.js <CSV目录>     # 指定目录');
        console.error('   node update.js <CSV文件名>   # 指定文件');
        console.error('   node update.js               # 自动查找');
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

    // 6.5 更新 config.json 数据版本号
    const today = new Date();
    const yyyymmdd = today.getFullYear().toString() +
        String(today.getMonth() + 1).padStart(2, '0') +
        String(today.getDate()).padStart(2, '0');
    try {
        const configPath = path.join(ROOT, 'config.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        config.games_data_version = yyyymmdd;
        fs.writeFileSync(configPath, JSON.stringify(config), 'utf-8');
        console.log(`已更新数据版本号: ${yyyymmdd}`);
    } catch(e) {
        console.log('⚠️  config.json 更新失败:', e.message);
    }

    // 7. 提取封面图 + 过滤二维码
    if (noCovers) {
        console.log('\n⏭️  跳过封面图提取');
    } else {
        console.log('\n正在提取封面图（只提取没有封面图的游戏）...');
        const coverCmd = forceCovers ? 'node extract-covers.js --force' : 'node extract-covers.js';
        try {
            execSync(coverCmd, { cwd: ROOT, stdio: 'inherit' });
        } catch(e) {
            console.log('封面图提取跳过（可稍后单独运行）');
        }

        // 7.5 自动过滤二维码图片
        console.log('\n正在过滤二维码图片...');
        try {
            execSync('node filter-qrcodes.js', { cwd: ROOT, stdio: 'inherit' });
        } catch(e) {
            console.log('二维码过滤跳过（可稍后单独运行）');
        }
    }

    // 8. Git 操作
    console.log('\n正在提交...');
    try {
        execSync('git add games.json config.json', { cwd: ROOT, stdio: 'pipe' });
        const diff = execSync('git diff --cached --quiet games.json', { cwd: ROOT }).toString().trim();
        if (diff === '') {
            console.log('数据无变化，跳过提交');
        } else {
            execSync(`git commit -m "update: 数据更新 ${new Date().toISOString().split('T')[0]}"`, { cwd: ROOT, stdio: 'pipe' });
            console.log('正在推送到GitHub...');
            execSync('git push', { cwd: ROOT, stdio: 'pipe' });
            console.log('✅ 推送成功！GitHub Pages 将在1-2分钟内更新');
        }
    } catch(e) {
        console.log('⚠️  Git操作失败，数据已更新到本地，请手动push');
    }

    // 9. 验证数据源可达
    console.log('\n验证数据源...');
    try {
        const https = require('https');
        const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf-8'));
        const testUrl = config.games_data_url + '?t=' + Date.now();
        await new Promise((resolve, reject) => {
            https.get(testUrl, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    const d = JSON.parse(data);
                    console.log(`✅ 数据源可达: ${d.length} 条数据`);
                    resolve();
                });
            }).on('error', reject);
        });
    } catch(e) {
        console.log('⚠️  数据源暂时不可达，稍后会自动恢复');
    }

    console.log('\n=== 更新完成 ===');
    console.log('APP 里点「重置」即可看到最新数据');
}

main().catch(e => { console.error('❌ 更新失败:', e.message); process.exit(1); });
