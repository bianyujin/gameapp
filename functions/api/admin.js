// Cloudflare Pages Function: /api/admin
// 站长后台的真动作接口。之前前端这三行只是假动作：
//   「推送数据版本」→ toast('已提交推送')，什么都没发生
//   「首页公告」    → 只写 localStorage，别人永远看不到
//   「强制更新提示」→ 只写 localStorage，等于没设
// 这里给它们接上真正的落点：
//   POST { action:'sync' }         → 触发 notion-sync.yml（workflow_dispatch），
//                                    跑完会自动 commit 新的 games-lite.json / games-full/*
//   GET  ?action=sync-status      → 查最近一次运行的状态，前端可轮询
//   POST { action:'config', notice:{...} } → 改 config.json 的 app_notice
//                                    （首页公告 / 强制更新都由它驱动，全站生效）
//
// 需要的环境变量（Cloudflare Dashboard → Pages → gameapp → Settings → Environment variables）：
//   ADMIN_KEY     管理员密码（与 /api/pinned、/api/private-data 同一个）
//   GITHUB_TOKEN  仓库令牌。**手动触发工作流需要 Actions: write 权限**，
//                 只读 Contents 的令牌调 dispatch 会拿到 403，这里会把原因原样回给前端。
import { checkLock, recordFail, clearFails, lockedResponse } from './_ratelimit.js';

const REPO = 'bianyujin/gameapp';
const WORKFLOW = 'notion-sync.yml';
const CONFIG_PATH = 'config.json';

function json(body, status) {
    return new Response(JSON.stringify(body), {
        status: status || 200,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
        }
    });
}

function adminKeyOf(env) {
    return (env && (env.ADMIN_KEY || env.PIN_CODE)) || '';
}

/* ---------- base64 <-> UTF-8 文本（Contents API 用） ---------- */
function b64ToText(b64) {
    const bin = atob(String(b64 || '').replace(/[\r\n\s]/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
}
function textToB64(text) {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
}

function ghHeaders(token) {
    return {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'gameacg-pages-function'
    };
}

/* ---------- 读取 + 写回 config.json，只改 app_notice ---------- */
async function patchConfig(token, notice) {
    const url = `https://api.github.com/repos/${REPO}/contents/${CONFIG_PATH}?ref=main`;
    let sha = '';
    let cur = {};
    try {
        const res = await fetch(url, { headers: ghHeaders(token) });
        if (!res.ok) {
            return { error: '读取 config.json 失败：GitHub 返回 ' + res.status, status: 502 };
        }
        const j = await res.json();
        sha = j.sha;
        cur = JSON.parse(b64ToText(j.content)) || {};
    } catch (e) {
        return { error: '读取 config.json 失败：' + e.message, status: 502 };
    }

    // 只覆盖 app_notice 里明确传了的字段，其余（latest_version / update_url / games_data_version…）
    // 一个字都不能动 —— 原生 App 的更新逻辑全靠它们。
    // AQ: 这里必须是 let —— 409/422 重试循环要按最新 sha 重新合成 body（const 曾让整个
    //     Functions 构建失败，生产站冻结两天没部署任何新内容）。
    const prev = cur.app_notice && typeof cur.app_notice === 'object' ? cur.app_notice : {};
    let next = {
        text: typeof notice.text === 'string' ? notice.text : (prev.text || ''),
        link: typeof notice.link === 'string' ? notice.link : (prev.link || ''),
        id: typeof notice.id === 'string' && notice.id ? notice.id : (prev.id || ''),
        force: typeof notice.force === 'boolean' ? notice.force : !!prev.force
    };
    // id 变了才换，否则老客户端会以为每次都是新公告
    if (!next.id) next.id = 'n' + Date.now().toString(36);

    cur.app_notice = next;
    const urlPut = `https://api.github.com/repos/${REPO}/contents/${CONFIG_PATH}`;
    const makeBody = () => JSON.stringify({
        message: next.text ? '首页公告更新（站点后台提交）' : '首页公告清除（站点后台提交）',
        content: textToB64(JSON.stringify(cur, null, 2) + '\n'),
        sha
    });
    // AD: 连点开关时两次 PUT 会撞 sha（409/422）——重读最新内容按本次 notice 重新合成再试，最多 3 次
    let put = null;
    let detail = '';
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            put = await fetch(urlPut, {
                method: 'PUT',
                headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
                body: makeBody()
            });
        } catch (e) {
            return { error: '提交 GitHub 失败：' + e.message, status: 502 };
        }
        if (put.ok) break;
        detail = await put.text().catch(() => '');
        if (put.status !== 409 && put.status !== 422) break;
        try {
            const res2 = await fetch(url + '', { headers: ghHeaders(token) });
            if (!res2.ok) {
                return { error: '读取 config.json 失败：GitHub 返回 ' + res2.status, status: 502 };
            }
            const j2 = await res2.json();
            sha = j2.sha;
            cur = JSON.parse(b64ToText(j2.content)) || {};
            const prev2 = cur.app_notice && typeof cur.app_notice === 'object' ? cur.app_notice : {};
            next = {
                text: typeof notice.text === 'string' ? notice.text : (prev2.text || ''),
                link: typeof notice.link === 'string' ? notice.link : (prev2.link || ''),
                id: typeof notice.id === 'string' && notice.id ? notice.id : (prev2.id || ''),
                force: typeof notice.force === 'boolean' ? notice.force : !!prev2.force
            };
            if (!next.id) next.id = 'n' + Date.now().toString(36);
            cur.app_notice = next;
        } catch (e) {
            return { error: '读取 config.json 失败：' + e.message, status: 502 };
        }
    }
    if (!put || !put.ok) {
        return { error: `GitHub 提交失败（${put ? put.status : 'ERR'}）：${detail.slice(0, 200)}`, status: 502 };
    }
    const r = await put.json().catch(() => ({}));
    return {
        ok: true,
        notice: next,
        commit: (r.commit && r.commit.html_url) || '',
        message: '已提交，约 1 分钟后部署完成，全站生效'
    };
}

/* ---------- 触发工作流 ---------- */
async function dispatchSync(token) {
    let res;
    try {
        res = await fetch(
            `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
            {
                method: 'POST',
                headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
                body: JSON.stringify({ ref: 'main' })
            }
        );
    } catch (e) {
        return { error: '连不上 GitHub：' + e.message, status: 502 };
    }
    // dispatch 成功返回 204 No Content
    if (res.status === 204) {
        return {
            ok: true,
            message: '已触发同步，约 1-3 分钟后新数据生效',
            runsUrl: `https://github.com/${REPO}/actions/workflows/${WORKFLOW}`
        };
    }
    const detail = await res.text().catch(() => '');
    if (res.status === 403 || res.status === 404) {
        return {
            error: '令牌没有触发工作流的权限（需要 Actions: write）。GitHub 返回 ' + res.status,
            hint: '给 GITHUB_TOKEN 补上 Actions 写权限后重试；或者直接去 GitHub Actions 页面手动 Run workflow。',
            runsUrl: `https://github.com/${REPO}/actions/workflows/${WORKFLOW}`,
            status: 502
        };
    }
    return { error: `触发失败（${res.status}）：${detail.slice(0, 200)}`, status: 502 };
}

async function syncStatus(token) {
    let res;
    try {
        res = await fetch(
            `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/runs?per_page=1`,
            { headers: ghHeaders(token) }
        );
    } catch (e) {
        return { error: '连不上 GitHub：' + e.message, status: 502 };
    }
    if (!res.ok) return { error: '查询运行状态失败：GitHub 返回 ' + res.status, status: 502 };
    const j = await res.json().catch(() => ({}));
    const run = (j.workflow_runs || [])[0];
    if (!run) return { ok: true, run: null };
    return {
        ok: true,
        run: {
            status: run.status,            // queued / in_progress / completed
            conclusion: run.conclusion,    // success / failure / cancelled / null
            startedAt: run.run_started_at || run.created_at,
            updatedAt: run.updated_at,
            url: run.html_url,
            event: run.event
        }
    };
}

export async function onRequestGet(context) {
    const { request, env } = context;
    const ADMIN_KEY = adminKeyOf(env);
    if (!ADMIN_KEY) {
        return json({ error: '服务端未配置管理员密钥（Cloudflare Pages 环境变量 ADMIN_KEY）' }, 503);
    }
    const TOKEN = env && env.GITHUB_TOKEN;
    if (!TOKEN) {
        return json({ error: '服务端未配置 GitHub 令牌（GITHUB_TOKEN）' }, 503);
    }
    let key = '';
    try { key = request.headers.get('X-Admin-Key') || ''; } catch (e) { key = ''; }
    const lock = await checkLock(request, env);
    if (lock.blocked) return lockedResponse(lock.retryAfterSec);
    if (!key || key !== ADMIN_KEY) {
        await recordFail(request, env);
        return json({ error: '密码错误' }, 403);
    }
    await clearFails(request, env);

    const sp = new URL(request.url).searchParams;
    const action = sp.get('action') || 'sync-status';
    if (action === 'sync-status') {
        const r = await syncStatus(TOKEN);
        return json(r, r.status || 200);
    }
    return json({ error: '未知 action：' + action }, 400);
}

export async function onRequestPost(context) {
    const { request, env } = context;
    const ADMIN_KEY = adminKeyOf(env);
    if (!ADMIN_KEY) {
        return json({ error: '服务端未配置管理员密钥（Cloudflare Pages 环境变量 ADMIN_KEY）' }, 503);
    }
    const TOKEN = env && env.GITHUB_TOKEN;
    if (!TOKEN) {
        return json({ error: '服务端未配置 GitHub 令牌（GITHUB_TOKEN）' }, 503);
    }
    let key = '';
    try { key = request.headers.get('X-Admin-Key') || ''; } catch (e) { key = ''; }
    const lock = await checkLock(request, env);
    if (lock.blocked) return lockedResponse(lock.retryAfterSec);
    if (!key || key !== ADMIN_KEY) {
        await recordFail(request, env);
        return json({ error: '密码错误' }, 403);
    }
    await clearFails(request, env);

    let body;
    try { body = await request.json(); } catch (e) { return json({ error: '请求体不是合法 JSON' }, 400); }

    const action = String(body.action || '');
    if (action === 'sync') {
        const r = await dispatchSync(TOKEN);
        return json(r, r.status || 200);
    }
    if (action === 'config') {
        const notice = body.notice && typeof body.notice === 'object' ? body.notice : {};
        if (notice.text && String(notice.text).length > 200) {
            return json({ error: '公告过长（上限 200 字）' }, 400);
        }
        const r = await patchConfig(TOKEN, notice);
        return json(r, r.status || 200);
    }
    return json({ error: '未知 action：' + action }, 400);
}
