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
        const text = await upstream.text();
        return new Response(text, {
            status: upstream.status,
            headers: {
                // 前端只做正则提取，返回纯文本避免被浏览器当 HTML 执行
                'Content-Type': 'text/plain; charset=utf-8',
                'Cache-Control': 'public, max-age=1800'
            }
        });
    } catch (e) {
        return new Response('upstream error', { status: 504 });
    }
}
