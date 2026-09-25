// Cloudflare Pages Function: /api/pinned
// 站长在手机/网页的置顶面板里直接提交 pinned.json，无需上 GitHub：
//   GET  → 返回仓库里当前的置顶配置（部署时打包的快照，供面板核对）
//   POST → 校验管理员密码后，用 GitHub Contents API 把新配置提交到仓库，
//          push 自动触发 Cloudflare Pages 部署，约 1 分钟全站生效
// 需要的环境变量（Cloudflare Dashboard → Pages → gameapp → Settings → Environment variables）：
//   ADMIN_KEY    管理员密码（与 /api/private-data 同一个）
//   GITHUB_TOKEN 有 gameapp 仓库 Contents 读写权限的令牌（服务端专用，绝不进前端）
const REPO = 'bianyujin/gameapp';
const FILE_PATH = 'pinned.json';

function json(body, status) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
        }
    });
}

function adminKeyOf(env) {
    return (env && (env.ADMIN_KEY || env.PIN_CODE)) || '';
}

// 只接受 {games:[], collections:[]}，元素只留数字/字符串，防脏数据进仓库
function sanitize(input) {
    if (!input || typeof input !== 'object') return null;
    const pick = (v) => {
        if (!Array.isArray(v)) return [];
        return v.map(x => {
            if (typeof x === 'number' && Number.isFinite(x)) return x;
            const s = String(x === undefined || x === null ? '' : x).trim();
            return s;
        }).filter(x => x !== '').slice(0, 50);
    };
    return { games: pick(input.games), collections: pick(input.collections) };
}

export async function onRequestGet(context) {
    const { env } = context;
    if (!adminKeyOf(env)) {
        return json({ error: '服务端未配置管理员密钥（Cloudflare Pages 环境变量 ADMIN_KEY）' }, 503);
    }
    let key = '';
    try { key = context.request.headers.get('X-Admin-Key') || ''; } catch (e) { key = ''; }
    if (key !== adminKeyOf(env)) return json({ error: '密码错误' }, 403);

    let config;
    try {
        config = await import('../../pinned.json');
        config = config.default || config;
    } catch (e) {
        return json({ error: '仓库 pinned.json 读取失败' }, 500);
    }
    return json({ games: config.games || [], collections: config.collections || [] });
}

export async function onRequestPost(context) {
    const { request, env } = context;
    const ADMIN_KEY = adminKeyOf(env);
    if (!ADMIN_KEY) {
        return json({ error: '服务端未配置管理员密钥（Cloudflare Pages 环境变量 ADMIN_KEY）' }, 503);
    }
    const TOKEN = env && env.GITHUB_TOKEN;
    if (!TOKEN) {
        return json({ error: '服务端未配置 GitHub 令牌（Cloudflare Pages 环境变量 GITHUB_TOKEN，需 gameapp 仓库 Contents 读写权限）' }, 503);
    }
    let key = '';
    try { key = request.headers.get('X-Admin-Key') || ''; } catch (e) { key = ''; }
    if (!key || key !== ADMIN_KEY) return json({ error: '密码错误' }, 403);

    let body;
    try { body = await request.json(); } catch (e) { return json({ error: '请求体不是合法 JSON' }, 400); }
    const config = sanitize(body);
    if (!config) return json({ error: '缺少 games/collections 配置' }, 400);

    const headers = {
        'Authorization': 'Bearer ' + TOKEN,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'gameacg-pages-function'
    };

    // 先取当前文件的 sha（Contents API 更新必须带），顺便保留 _note 说明字段
    let sha = undefined;
    let note = '';
    try {
        const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}?ref=main`, { headers });
        if (res.ok) {
            const cur = await res.json();
            sha = cur.sha;
            try { note = (JSON.parse(atob((cur.content || '').replace(/\n/g, ''))) || {})._note || ''; } catch (e) {}
        } else if (res.status !== 404) {
            return json({ error: '读取仓库 pinned.json 失败：GitHub 返回 ' + res.status }, 502);
        }
    } catch (e) {
        return json({ error: '连不上 GitHub API：' + e.message }, 502);
    }

    const toStore = note ? { ...config, _note: note } : config;
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(toStore, null, 2) + '\n')));
    let putRes;
    try {
        putRes = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`, {
            method: 'PUT',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: '置顶配置更新（站点置顶面板提交）',
                content,
                sha
            })
        });
    } catch (e) {
        return json({ error: '提交 GitHub 失败：' + e.message }, 502);
    }
    if (!putRes.ok) {
        const detail = await putRes.text().catch(() => '');
        return json({ error: `GitHub 提交失败（${putRes.status}）：${detail.slice(0, 200)}` }, 502);
    }
    const result = await putRes.json().catch(() => ({}));
    return json({
        ok: true,
        commit: (result.commit && result.commit.html_url) || '',
        message: '已提交，约 1 分钟后部署完成，全站生效'
    });
}
