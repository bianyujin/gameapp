// Cloudflare Pages Function: /api/private-data
// 管理员私有数据接口：
//   1. 密码只存在服务端环境变量 ADMIN_KEY 里，前端把输入的密码放在 X-Admin-Key 请求头中传来比对；
//   2. 私有数据在仓库中是 AES-256-GCM 密文（同步脚本用 SHA-256(ADMIN_KEY) 派生密钥加密），
//      这里解密后才返回，即使仓库公开也拿不到明文。
import encrypted from '../_data/private-data.json';

function json(body, status) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
        }
    });
}

function base64ToBuf(b64) {
    const bin = atob(b64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf;
}

async function decryptPrivateData(adminKey) {
    const rawKey = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(adminKey)));
    const aesKey = await crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['decrypt']);
    const iv = base64ToBuf(encrypted.iv);
    const ct = base64ToBuf(encrypted.data);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ct);
    return JSON.parse(new TextDecoder().decode(plain));
}

export async function onRequestGet(context) {
    const { request, env } = context;
    const ADMIN_KEY = env && env.ADMIN_KEY;
    // 密钥未配置时统一返回 503，不泄露"密码对不对"的信息
    if (!ADMIN_KEY) {
        return json({ error: '服务端未配置管理员密钥（Cloudflare Pages 环境变量 ADMIN_KEY）' }, 503);
    }
    let key = '';
    try { key = request.headers.get('X-Admin-Key') || ''; } catch (e) { key = ''; }
    if (!key || key !== ADMIN_KEY) {
        return json({ error: '密码错误' }, 403);
    }
    if (!encrypted || !encrypted.data || !encrypted.iv) {
        return json({ error: '私有数据文件缺失' }, 500);
    }
    try {
        const privateData = await decryptPrivateData(ADMIN_KEY);
        return new Response(JSON.stringify(privateData), {
            status: 200,
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store'
            }
        });
    } catch (e) {
        return json({ error: '私有数据解密失败（请检查 Cloudflare 与 GitHub 两端 ADMIN_KEY 是否一致）' }, 500);
    }
}
