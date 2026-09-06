// Cloudflare Pages Function: /api/preview
// 代理抓取预览页 HTML，供前端提取封面图（绕过图站 CORS/防盗链）。
// 之前该接口不存在，Pages 把未知路由兜底成 index.html，前端拿到自己的页面导致封面兜底失效。
// 只允许已知的预览站域名，避免被当成开放代理滥用。
const ALLOWED_HOSTS = /(^|\.)(moebox\.io|ibb\.co|postimg\.cc|imgbox\.com|coklw\.vip|coklw\.net|acg\.lol)$/i;

export async function onRequestGet(context) {
    const { request } = context;
    const target = new URL(request.url).searchParams.get('url');
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
    try {
        const upstream = await fetch(target, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
                'Accept': 'text/html,*/*'
            },
            signal: AbortSignal.timeout(12000),
            cf: { cacheTtl: 1800, cacheEverything: true }
        });
        // 必须用 arrayBuffer 原样转发字节：之前用 text() 会把图片二进制按 UTF-8
        // 解码再重编码，字节被 U+FFFD 替换损坏，导致代理出的图片全部无法解码
        const buf = await upstream.arrayBuffer();
        return new Response(buf, {
            status: upstream.status,
            headers: {
                'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
                'Cache-Control': 'public, max-age=1800'
            }
        });
    } catch (e) {
        return new Response('upstream error', { status: 504 });
    }
}
