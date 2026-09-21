// Cloudflare Pages Function: /api/preview
// 两个用途：
//   1) 代理抓取预览页 HTML，供前端提取封面图（绕过图站 CORS/防盗链）；
//   2) 作为 App 的图片通道 —— 带 &w=&fmt=&q= 时先经 wsrv 压成小图（国内手机直连 wsrv 不通，
//      但 Cloudflare 机房出海是通的），压缩失败则回退原图，保证图一定能出来。
// 只允许已知的图床/预览站域名，避免被当成开放代理滥用。
const ALLOWED_HOSTS = /(^|\.)(moebox\.io|ibb\.co|postimg\.cc|imgbox\.com|coklw\.vip|coklw\.net|acg\.lol)$/i;

const DAY = 86400;
const HALF_HOUR = 1800;

function imgResponse(buf, ct) {
    const type = (ct || 'application/octet-stream').toLowerCase();
    const isImage = type.indexOf('image/') === 0;
    return new Response(buf, {
        status: 200,
        headers: {
            'Content-Type': type,
            // 图片路径带日期、内容不会变 → 长缓存；HTML 预览页会更新 → 短缓存
            'Cache-Control': 'public, max-age=' + (isImage ? DAY : HALF_HOUR)
        }
    });
}

// 交给 wsrv 缩放压缩：800px webp 相对原图通常能省 80% 以上流量与磁盘
async function tryShrink(target, w, fmt, q) {
    const src = target.replace(/^https?:\/\//, '');
    const u = 'https://wsrv.nl/?url=' + encodeURIComponent(src)
        + '&w=' + w + '&output=' + fmt + '&q=' + q + '&n=-1';
    try {
        const r = await fetch(u, { signal: AbortSignal.timeout(12000) });
        const ct = (r.headers.get('content-type') || '').toLowerCase();
        if (!r.ok || ct.indexOf('image/') !== 0) return null;
        const buf = await r.arrayBuffer();
        if (!buf.byteLength) return null;
        return imgResponse(buf, ct);
    } catch (e) {
        return null;
    }
}

export async function onRequestGet(context) {
    const { request } = context;
    const sp = new URL(request.url).searchParams;
    const target = sp.get('url');
    if (!target || !/^https?:\/\//i.test(target)) {
        return new Response('missing url', { status: 400 });
    }
    let host = '';
    try { host = new URL(target).hostname; } catch (e) {
        return new Response('bad url', { status: 400 });
    }
    if (!ALLOWED_HOSTS.test(host)) {
        return new Response('host not allowed', { status: 403 });
    }

    // 压缩请求：只在图片、非 gif（保动画）、宽度合理时启用
    const wantW = parseInt(sp.get('w') || '', 10);
    let fmt = (sp.get('fmt') || 'webp').toLowerCase();
    if (fmt === 'jpeg') fmt = 'jpg';
    const q = parseInt(sp.get('q') || '', 10);
    const isGif = /\.gif(\?|$)/i.test(target);
    if (wantW > 0 && !isGif && /^(webp|jpg|png)$/.test(fmt)) {
        // 压缩结果对同一 URL 不变，边缘缓存住，避免每次都回源 wsrv 消耗配额
        const cache = caches.default;
        const cacheKey = new Request(request.url, { method: 'GET' });
        const hit = await cache.match(cacheKey);
        if (hit) return hit;
        const shrunk = await tryShrink(target, Math.min(wantW, 1600), fmt, (q > 0 && q <= 100) ? q : 80);
        if (shrunk) {
            context.waitUntil(cache.put(cacheKey, shrunk.clone()));
            return shrunk;
        }
        // 压缩失败：继续走原图转发，宁可给大图也不能不给图
    }

    try {
        const upstream = await fetch(target, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
                'Accept': 'image/*,text/html,*/*'
            },
            signal: AbortSignal.timeout(12000),
            cf: { cacheTtl: HALF_HOUR, cacheEverything: true }
        });
        // 必须用 arrayBuffer 原样转发字节：之前用 text() 会把图片二进制按 UTF-8
        // 解码再重编码，字节被 U+FFFD 替换损坏，导致代理出的图片全部无法解码
        const buf = await upstream.arrayBuffer();
        return imgResponse(buf, upstream.headers.get('content-type') || 'application/octet-stream');
    } catch (e) {
        return new Response('upstream error', { status: 504 });
    }
}
