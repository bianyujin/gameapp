// Cloudflare Pages Function: /api/private-data
// 管理员私有数据接口：密码只存在服务端环境变量 ADMIN_KEY 里，
// 前端把输入的密码放在 X-Admin-Key 请求头中传来，服务端比对后才返回数据。
// 密码不再出现在任何公开文件（config.json / admin.js / games.json）中。
import privateData from '../_data/private-data.json';

function json(body, status) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
        }
    });
}

export async function onRequestGet(context) {
    const { request, env } = context;
    const ADMIN_KEY = env && env.ADMIN_KEY;
    // 密钥未配置时统一返回 503，避免泄露"密码对不对"的信息
    if (!ADMIN_KEY) {
        return json({ error: '服务端未配置管理员密钥（Cloudflare Pages 环境变量 ADMIN_KEY）' }, 503);
    }
    let key = '';
    try { key = request.headers.get('X-Admin-Key') || ''; } catch (e) { key = ''; }
    if (!key || key !== ADMIN_KEY) {
        return json({ error: '密码错误' }, 403);
    }
    return new Response(JSON.stringify(privateData), {
        status: 200,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
        }
    });
}
