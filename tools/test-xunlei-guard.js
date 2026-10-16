// 单测 isImageOnlyLink 用真实污染样例（与 sync-notion.js 保持同步）
function isImageOnlyLink(val) {
    if (/pan\.xunlei\.com|magnet:\?xt=/i.test(val)) return false;
    const urls = String(val).match(/https?:\/\/[^\s\n,，"']+/gi) || [];
    if (urls.length === 0) return false;
    const imgRe = /\.(png|jpe?g|gif|webp|bmp|avif|svg)(\?|#|$)/i;
    return urls.some(u => imgRe.test(u));
}

const samples = [
    ['img-png', '<img style="width:800px" src="https://image.acg.lol/file/2026/09/28/R400-2.png" alt="R400 (2)" border="0">', true],
    ['img-jpg-webp', '<img src="https://image.acg.lol/file/2026/10/06/1-1.jpg"><img src="https://image.acg.lol/file/2026/10/06/1-10.webp">', true],
    ['img-p-tag', '<p><img style="width: 800px" src="https://image.acg.lol/file/2026/09/13/S632-2.png" border="0" /></p>', true],
    ['xunlei-real', 'https://pan.xunlei.com/s/VOabcd123', false],
    ['magnet', 'magnet:?xt=urn:btih:abcdef', false],
    ['mixed', '<img src="https://image.acg.lol/a.png"> https://pan.xunlei.com/s/VOx', false],
    ['baidu', 'https://pan.baidu.com/s/1abc?pwd=xyz', false],
    ['empty', '', false],
];

let fail = 0;
for (const [name, val, want] of samples) {
    const got = isImageOnlyLink(val);
    const tag = got === want ? 'PASS' : 'FAIL';
    if (got !== want) fail++;
    console.log(tag, name, 'got=' + got, 'want=' + want);
}
process.exit(fail ? 1 : 0);
