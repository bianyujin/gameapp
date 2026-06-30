/**
 * GAMEACG 一键同步工具
 * 
 * 用法: node sync.js
 * 
 * 交互式菜单，选择同步方式：
 *   1. 快速同步（只更新数据，不提取封面图）
 *   2. 完整同步（更新数据 + 提取新封面图）
 *   3. 强制重提封面（重新提取所有封面图）
 *   4. 重置数据（清除缓存，从Notion重新导出）
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = __dirname;
const CSV_DIR = path.join(ROOT, 'notion_data.csv');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(r => rl.question(q, r));

async function findCsvFile() {
    // 在常见位置查找CSV
    const searchDirs = [
        path.join(process.env.USERPROFILE || '', 'Downloads'),
        path.join(process.env.USERPROFILE || '', 'Desktop'),
        path.join(process.env.USERPROFILE || '', 'Documents'),
    ];
    
    for (const dir of searchDirs) {
        if (!fs.existsSync(dir)) continue;
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.csv') && f.includes('GAMEACG'));
        if (files.length > 0) {
            const newest = files.sort((a, b) => {
                return fs.statSync(path.join(dir, b)).mtimeMs - fs.statSync(path.join(dir, a)).mtimeMs;
            })[0];
            return path.join(dir, newest);
        }
    }
    return null;
}

async function main() {
    console.log('');
    console.log('╔══════════════════════════════════════╗');
    console.log('║     GAMEACG 一键同步工具 v2.1        ║');
    console.log('╚══════════════════════════════════════╝');
    console.log('');
    console.log('请选择同步方式：');
    console.log('');
    console.log('  1. 📦 快速同步     只更新数据，跳过封面图（几秒）');
    console.log('  2. 🖼️  完整同步     更新数据 + 提取新封面图（1-2分钟）');
    console.log('  3. 🔄 强制重提封面  重新提取所有封面图（3-5分钟）');
    console.log('  4. ❌ 退出');
    console.log('');

    const choice = await ask('请输入选项 (1/2/3/4): ');
    rl.close();

    const choiceNum = parseInt(choice.trim());

    if (choiceNum === 4 || isNaN(choiceNum)) {
        console.log('已退出');
        return;
    }

    if (choiceNum === 3) {
        // 只重提封面图
        console.log('\n正在重新提取所有封面图...');
        execSync('node extract-covers.js --force', { cwd: ROOT, stdio: 'inherit' });
        console.log('\n正在提交...');
        try {
            execSync('git add games.json', { cwd: ROOT, stdio: 'pipe' });
            execSync('git commit -m "update: 重新提取封面图 ' + new Date().toISOString().split('T')[0] + '"', { cwd: ROOT, stdio: 'pipe' });
            execSync('git push', { cwd: ROOT, stdio: 'pipe' });
            console.log('✅ 推送成功！');
        } catch(e) {
            console.log('⚠️ 无变化或推送失败');
        }
        return;
    }

    // 选项1和2需要CSV文件
    // 自动查找CSV
    let csvPath = await findCsvFile();
    
    if (!csvPath) {
        // 在当前目录查找
        const localCsv = fs.readdirSync(ROOT).find(f => f.endsWith('.csv'));
        if (localCsv) csvPath = path.join(ROOT, localCsv);
    }

    if (!csvPath || !fs.existsSync(csvPath)) {
        console.log('\n❌ 未找到CSV文件');
        console.log('请把Notion导出的CSV文件放到仓库根目录：');
        console.log('  ' + ROOT);
        console.log('然后重新运行 node sync.js');
        return;
    }

    console.log('\n找到CSV: ' + path.basename(csvPath));

    if (choiceNum === 1) {
        // 快速同步
        console.log('正在快速同步...');
        execSync('node update.js "' + csvPath + '" --no-covers', { cwd: ROOT, stdio: 'inherit' });
    } else if (choiceNum === 2) {
        // 完整同步
        console.log('正在完整同步...');
        execSync('node update.js "' + csvPath + '"', { cwd: ROOT, stdio: 'inherit' });
    }
}

main().catch(e => {
    console.error('错误:', e.message);
    process.exit(1);
});
