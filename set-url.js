/**
 * 替换 Cloudflare Pages URL
 * 
 * 用法: node set-url.js https://你的项目名.pages.dev
 * 
 * 会自动替换 config.json 中的地址
 */

const fs = require('fs');
const path = require('path');

const newUrl = process.argv[2];

if (!newUrl || !newUrl.startsWith('http')) {
    console.log('用法: node set-url.js https://你的项目名.pages.dev');
    console.log('例如: node set-url.js https://gameacg-abc123.pages.dev');
    process.exit(1);
}

// 确保 URL 以 / 结尾
const baseUrl = newUrl.endsWith('/') ? newUrl.slice(0, -1) : newUrl;

const configPath = path.join(__dirname, 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const oldUrl = config.games_data_url;
config.games_data_url = baseUrl + '/games.json';

fs.writeFileSync(configPath, JSON.stringify(config, null, 0) + '\n');

console.log('✅ config.json 已更新');
console.log('   旧地址:', oldUrl);
console.log('   新地址:', config.games_data_url);
console.log('');
console.log('下一步: git add config.json && git commit -m "chore: 切换到Cloudflare Pages" && git push');
