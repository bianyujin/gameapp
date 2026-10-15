// One-shot: update Cloudflare Pages production secret ADMIN_KEY with an explicit value.
// Uses wrangler's own auth (OAuth token cached in ~/.wrangler or via CLOUDFLARE_API_TOKEN if set).
// Runs: npx wrangler pages secret put ADMIN_KEY --project-name gameapp with stdin = value + newline.
const { spawnSync } = require('child_process');
const value = process.argv[2];
if (!value) { console.error('usage: node set-adminkey.js <value>'); process.exit(2); }
const child = spawnSync('npx', ['wrangler', 'pages', 'secret', 'put', 'ADMIN_KEY', '--project-name', 'gameapp'], {
  cwd: process.cwd(),
  input: value + '\n',
  encoding: 'utf8',
  shell: true,
  timeout: 120000
});
console.log('stdout:', child.stdout);
console.error('stderr:', child.stderr);
console.log('status:', child.status);
