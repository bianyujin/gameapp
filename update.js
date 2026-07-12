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
const readline = require('readline');

const ROOT = __dirname;
const GAMES_FILE = path.join(ROOT, 'games.json');
const CSV_INPUT_DIR = path.join(ROOT, 'csv-input');

// ========== 交互式输入 ==========
function askQuestion(prompt) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => {
        rl.question(prompt, answer => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

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

// ========== 补过滤二维码 ==========
async function fixQrCodes() {
    console.log('=== 补过滤二维码 ===\n');

    // 读取当前的coverUrls
    const currentGames = JSON.parse(fs.readFileSync(GAMES_FILE, 'utf-8'));
    const currentUrls = new Set();
    currentGames.forEach(g => { if (g.coverUrls) g.coverUrls.forEach(u => currentUrls.add(u)); });
    console.log('当前有 ' + currentUrls.size + ' 张图片');

    // 从git历史找更新前的数据（往前找，直到图片数比当前少）
    console.log('正在查找更新前的数据...');
    const tempFile = path.join(ROOT, '_old_games.json');
    let oldUrls = new Set();
    let foundCommit = null;
    for (let i = 1; i <= 10; i++) {
        try {
            execSync('git show HEAD~' + i + ':games.json > _old_games.json', { cwd: ROOT, stdio: 'pipe' });
        } catch(e) {
            break;
        }
        try {
            const oldGames = JSON.parse(fs.readFileSync(tempFile, 'utf-8'));
            const urls = new Set();
            oldGames.forEach(g => { if (g.coverUrls) g.coverUrls.forEach(u => urls.add(u)); });
            console.log('  HEAD~' + i + ' (' + oldGames.length + '条): ' + urls.size + ' 张图片');
            if (urls.size < currentUrls.size) {
                oldUrls = urls;
                foundCommit = 'HEAD~' + i;
                break;
            }
        } catch(e) {
            break;
        }
    }
    try { fs.unlinkSync(tempFile); } catch(e) {}

    if (!foundCommit) {
        console.log('✅ 没有找到比当前更早的数据，无需补过滤');
        return;
    }
    console.log('使用 ' + foundCommit + ' 作为更新前数据');

    // 找出新增的URL
    const newUrls = [...currentUrls].filter(u => !oldUrls.has(u) && /\.(jpg|jpeg|png)(\?|$)/i.test(u));
    console.log('新增图片: ' + newUrls.length + ' 张');

    if (newUrls.length === 0) {
        console.log('✅ 没有需要补过滤的图片');
        return;
    }

    // 从checked-urls.json中删除新增的URL
    const CHECKED_FILE = path.join(ROOT, 'checked-urls.json');
    let checked = {};
    try { checked = JSON.parse(fs.readFileSync(CHECKED_FILE, 'utf-8')); } catch(e) {}
    newUrls.forEach(u => delete checked[u]);
    fs.writeFileSync(CHECKED_FILE, JSON.stringify(checked));

    // 运行filter-qrcodes.js
    console.log('\n开始过滤二维码...');
    try {
        execSync('node filter-qrcodes.js', { cwd: ROOT, stdio: 'inherit' });
    } catch(e) {
        console.log('过滤过程出错');
    }

    // 提交
    console.log('\n正在提交...');
    try {
        execSync('git add games.json', { cwd: ROOT, stdio: 'pipe' });
        execSync('git commit -m "补过滤新增图片的二维码"', { cwd: ROOT, stdio: 'pipe' });
        execSync('git push', { cwd: ROOT, stdio: 'pipe' });
        console.log('✅ 推送成功！');
    } catch(e) {
        console.log('⚠️ Git操作失败，数据已更新到本地，请手动push');
    }
}

// ========== 主流程 ==========
async function main() {
    console.log('=== GAMEACG 一键更新 ===\n');

    // 确保 csv-input 文件夹存在
    if (!fs.existsSync(CSV_INPUT_DIR)) fs.mkdirSync(CSV_INPUT_DIR, { recursive: true });

    // 解析命令行参数
    const args = process.argv.slice(2);
    let noCovers = args.includes('--no-covers');
    let forceCovers = args.includes('--force-covers');
    let csvArg = args.find(a => !a.startsWith('--'));
    let fixQrOnly = args.includes('--fix-qr');

    // 没有参数时，进入交互式菜单
    if (args.length === 0) {
        console.log('请把CSV文件放到 csv-input 文件夹里\n');
        console.log('请选择更新方式：');
        console.log('  1. 默认更新（推荐）- 更新数据 + 提取新封面图 + 过滤二维码');
        console.log('  2. 只更新数据 - 不提取封面图（最快）');
        console.log('  3. 全部重新提取 - 强制重新提取所有封面图（很慢）');
        console.log('  4. 补过滤二维码 - 只检查上次没检查的图片');
        console.log('');
        const choice = await askQuestion('请输入选项 (1/2/3/4，直接回车=1): ');
        if (choice === '2') { noCovers = true; }
        else if (choice === '3') { forceCovers = true; }
        else if (choice === '4') { fixQrOnly = true; }
    }

    // 补过滤二维码模式
    if (fixQrOnly) {
        await fixQrCodes();
        return;
    }

    if (noCovers) console.log('📌 模式: 跳过封面图提取');
    if (forceCovers) console.log('📌 模式: 强制重新提取所有封面图');

    // 1. 查找 CSV 文件（优先 csv-input 文件夹）
    let csvPath = csvArg;
    if (!csvPath && fs.existsSync(CSV_INPUT_DIR)) {
        // 优先从 csv-input 文件夹查找
        const csvFiles = fs.readdirSync(CSV_INPUT_DIR)
            .filter(f => f.endsWith('_all.csv') && f.includes('GAMEACG'))
            .map(f => ({ name: path.join(CSV_INPUT_DIR, f), time: fs.statSync(path.join(CSV_INPUT_DIR, f)).mtimeMs }))
            .sort((a, b) => b.time - a.time);
        if (csvFiles.length > 0) {
            csvPath = csvFiles[0].name;
            console.log(`csv-input 文件夹找到CSV: ${path.basename(csvPath)}`);
        } else {
            // 回退：查找任意 csv
            const anyCsv = fs.readdirSync(CSV_INPUT_DIR)
                .filter(f => f.endsWith('.csv'))
                .map(f => ({ name: path.join(CSV_INPUT_DIR, f), time: fs.statSync(path.join(CSV_INPUT_DIR, f)).mtimeMs }))
                .sort((a, b) => b.time - a.time);
            if (anyCsv.length > 0) {
                csvPath = anyCsv[0].name;
                console.log(`csv-input 文件夹找到CSV: ${path.basename(csvPath)}`);
            }
        }
    } else if (csvPath && fs.existsSync(csvPath) && fs.statSync(csvPath).isDirectory()) {
        // 命令行指定了目录
        const csvFiles = fs.readdirSync(csvPath)
            .filter(f => f.endsWith('_all.csv') && f.includes('GAMEACG'))
            .map(f => ({ name: path.join(csvPath, f), time: fs.statSync(path.join(csvPath, f)).mtimeMs }))
            .sort((a, b) => b.time - a.time);
        if (csvFiles.length > 0) {
            csvPath = csvFiles[0].name;
            console.log(`目录中找到CSV: ${path.basename(csvPath)}`);
        } else {
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
        // 自动查找仓库根目录
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
        console.error('\n❌ 未找到CSV文件！');
        console.error('\n   请把飞书导出的CSV文件放到：');
        console.error('   d:\\trae_project\\gameapp\\csv-input\\');
        console.error('\n   然后重新运行本脚本');
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
        // 记录提取前的coverUrls
        const beforeUrls = new Set();
        try {
            const beforeGames = JSON.parse(fs.readFileSync(GAMES_FILE, 'utf-8'));
            beforeGames.forEach(g => { if (g.coverUrls) g.coverUrls.forEach(u => beforeUrls.add(u)); });
        } catch(e) {}

        console.log('\n正在提取封面图（只提取没有封面图的游戏）...');
        const coverCmd = forceCovers ? 'node extract-covers.js --force' : 'node extract-covers.js';
        try {
            execSync(coverCmd, { cwd: ROOT, stdio: 'inherit' });
        } catch(e) {
            console.log('封面图提取跳过（可稍后单独运行）');
        }

        // 找出新增的coverUrls，只检查这些
        console.log('\n正在过滤二维码图片（只检查新增的）...');
        try {
            const afterGames = JSON.parse(fs.readFileSync(GAMES_FILE, 'utf-8'));
            const newUrls = [];
            afterGames.forEach(g => {
                if (g.coverUrls) g.coverUrls.forEach(u => {
                    if (!beforeUrls.has(u) && /\.(jpg|jpeg|png)(\?|$)/i.test(u)) newUrls.push(u);
                });
            });

            if (newUrls.length > 0) {
                console.log(`发现 ${newUrls.length} 张新图片需要检查`);
                // 从checked-urls.json中删除新增的URL，让它们被重新检查
                const CHECKED_FILE = path.join(ROOT, 'checked-urls.json');
                let checked = {};
                try { checked = JSON.parse(fs.readFileSync(CHECKED_FILE, 'utf-8')); } catch(e) {}
                newUrls.forEach(u => delete checked[u]);
                fs.writeFileSync(CHECKED_FILE, JSON.stringify(checked));
                // 运行filter-qrcodes.js（只检查新增的）
                execSync('node filter-qrcodes.js', { cwd: ROOT, stdio: 'inherit' });
            } else {
                console.log('没有新图片需要检查');
            }
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
