// Cloudflare Pages Function shared helper: brute-force lockout for admin endpoints.
// Policy: count FAILED password attempts per client IP in KV; after MAX_FAILS within
// WINDOW_SEC, reject with 429 until the lock expires. Successful auth resets the counter.
// KV namespace binding name: RATE_KV (create: npx wrangler kv namespace create RATE_KV,
// then bind it to the Pages project in the Dashboard or wrangler.toml).
// If the binding is missing, everything degrades to "no rate limiting" instead of erroring.

export const MAX_FAILS = 5;
export const WINDOW_SEC = 60 * 60; // 1 hour lockout

function ipOf(request) {
    try {
        const h = request.headers;
        return h.get('CF-Connecting-IP') || h.get('X-Forwarded-For') || h.get('X-Real-IP') || 'unknown';
    } catch (e) {
        return 'unknown';
    }
}

// Returns { blocked, retryAfterSec } if currently locked, else { blocked: false }.
export async function checkLock(request, env) {
    const kv = env && env.RATE_KV;
    if (!kv) return { blocked: false };
    const ip = ipOf(request);
    const raw = await kv.get('admin_fail:' + ip);
    if (!raw) return { blocked: false };
    let rec;
    try { rec = JSON.parse(raw); } catch (e) { return { blocked: false }; }
    const age = (Date.now() - rec.firstAt) / 1000;
    if (age > WINDOW_SEC) {
        // window expired: forget the record
        try { await kv.delete('admin_fail:' + ip); } catch (e) {}
        return { blocked: false };
    }
    if (rec.count >= MAX_FAILS) {
        return { blocked: true, retryAfterSec: Math.ceil(WINDOW_SEC - age) };
    }
    return { blocked: false };
}

// Record one failed attempt (called only when the password is wrong).
export async function recordFail(request, env) {
    const kv = env && env.RATE_KV;
    if (!kv) return;
    const ip = ipOf(request);
    const raw = await kv.get('admin_fail:' + ip);
    let rec;
    try { rec = JSON.parse(raw); } catch (e) { rec = null; }
    const now = Date.now();
    if (!rec || (now - rec.firstAt) / 1000 > WINDOW_SEC) {
        rec = { firstAt: now, count: 0 };
    }
    rec.count += 1;
    try { await kv.put('admin_fail:' + ip, JSON.stringify(rec), { expirationTtl: WINDOW_SEC + 60 }); } catch (e) {}
}

// Successful auth: clear the counter so honest retries are never punished.
export async function clearFails(request, env) {
    const kv = env && env.RATE_KV;
    if (!kv) return;
    try { await kv.delete('admin_fail:' + ipOf(request)); } catch (e) {}
}

export function lockedResponse(retryAfterSec) {
    return new Response(JSON.stringify({
        error: '密码连续错误次数过多，已锁定 ' + Math.ceil((retryAfterSec || WINDOW_SEC) / 60) + ' 分钟，请稍后再试'
    }), {
        status: 429,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Retry-After': String(retryAfterSec || WINDOW_SEC),
            'Cache-Control': 'no-store'
        }
    });
}
