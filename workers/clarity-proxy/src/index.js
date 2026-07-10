/**
 * clarity-proxy — Cloudflare Worker
 *
 * Routes:
 *   POST /          — forwards Anthropic API calls from
 *                     twobirds-kramerica.github.io/clarity/ with the
 *                     server-side key (the Clarity built-in provider).
 *   POST /feedback  — accepts beta feedback from any twobirds-kramerica
 *                     GitHub Pages product and stores it in the
 *                     twobirds-beta-feedback KV namespace. No PII beyond
 *                     an optional reply-to email. No third-party calls.
 *
 * Deploy:
 *   cd workers/clarity-proxy
 *   wrangler deploy
 *   wrangler secret put ANTHROPIC_API_KEY
 *
 * Then update CLARITY_PROXY_URL in llm-provider.js with the deployed URL.
 *
 * Reading feedback:
 *   wrangler kv key list --namespace-id 96d2302dab424abd8d85bed80b4bd25b
 *   wrangler kv key get <key> --namespace-id 96d2302dab424abd8d85bed80b4bd25b
 *
 * Abuse protection (S-CLARITY-RATELIMIT, 2026-07-10): the / route spends real
 * Anthropic API credits per call, so it is rate limited two ways: per-IP
 * (blocks a single bot/script hammering the endpoint) and a daily global cap
 * (blocks a distributed attack spread across many IPs). Both use the
 * RATELIMIT KV namespace with self-expiring keys (no cleanup job needed).
 */

const ALLOWED_ORIGIN = 'https://twobirds-kramerica.github.io';
const ANTHROPIC_API  = 'https://api.anthropic.com/v1/messages';

/* Feedback limits — keep entries small and PII-light */
const FEEDBACK_MAX_MESSAGE = 4000;
const FEEDBACK_MAX_FIELD   = 300;

/* Rate limits. Generous enough that a real visitor retrying the diagnostic
   a few times never notices; tight enough that a script cannot run up a
   real bill. Tune these if real usage patterns say otherwise. */
const IP_LIMIT_PER_HOUR       = 8;   // Anthropic proxy route, per IP
const IP_LIMIT_WINDOW_SECONDS = 3600;
const DAILY_GLOBAL_LIMIT      = 300; // Anthropic proxy route, all IPs combined
const DAILY_WINDOW_SECONDS    = 86400;
const FEEDBACK_IP_LIMIT_PER_HOUR = 10; // /feedback is free but KV storage is not infinite

function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || 'unknown';
}

/* Fixed-window counter. Returns { blocked, count, limit }. KV `expirationTtl`
   means unused windows evaporate on their own — no cron cleanup needed. */
async function checkAndIncrement(env, key, limit, windowSeconds) {
  const current = parseInt((await env.RATELIMIT.get(key)) || '0', 10);
  if (current >= limit) {
    return { blocked: true, count: current, limit };
  }
  await env.RATELIMIT.put(key, String(current + 1), { expirationTtl: windowSeconds });
  return { blocked: false, count: current + 1, limit };
}

function rateLimitedResponse(safeOrigin, message) {
  return new Response(
    JSON.stringify({ error: { message } }),
    { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '3600', ...corsHeaders(safeOrigin) } }
  );
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin':  origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, anthropic-version',
  };
}

function clip(value, max) {
  return String(value == null ? '' : value).slice(0, max);
}

async function handleFeedback(request, env, safeOrigin) {
  if (!env.FEEDBACK) {
    return new Response(
      JSON.stringify({ error: { message: 'Feedback storage not configured.' } }),
      { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders(safeOrigin) } }
    );
  }

  let data;
  try {
    data = await request.json();
  } catch (e) {
    return new Response(
      JSON.stringify({ error: { message: 'Invalid JSON body.' } }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders(safeOrigin) } }
    );
  }

  const message = clip(data.message, FEEDBACK_MAX_MESSAGE).trim();
  if (!message) {
    return new Response(
      JSON.stringify({ error: { message: 'Feedback message is required.' } }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders(safeOrigin) } }
    );
  }

  const entry = {
    product:   clip(data.product, FEEDBACK_MAX_FIELD) || 'unknown',
    page:      clip(data.page, FEEDBACK_MAX_FIELD),
    url:       clip(data.url, FEEDBACK_MAX_FIELD),
    type:      clip(data.type, FEEDBACK_MAX_FIELD),
    message:   message,
    email:     clip(data.email, FEEDBACK_MAX_FIELD),
    userAgent: clip(request.headers.get('User-Agent'), FEEDBACK_MAX_FIELD),
    receivedAt: new Date().toISOString(),
  };

  const key = 'fb:' + entry.receivedAt + ':' + crypto.randomUUID().slice(0, 8);
  await env.FEEDBACK.put(key, JSON.stringify(entry));

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(safeOrigin) },
  });
}

export default {
  async fetch(request, env) {
    try {
      const origin = request.headers.get('Origin') || '';
      const safeOrigin = origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN;

      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders(safeOrigin) });
      }

      if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
      }

      const url = new URL(request.url);
      const ip = clientIp(request);

      if (url.pathname === '/feedback') {
        const fbLimit = await checkAndIncrement(env, `fb:${ip}`, FEEDBACK_IP_LIMIT_PER_HOUR, IP_LIMIT_WINDOW_SECONDS);
        if (fbLimit.blocked) {
          return rateLimitedResponse(safeOrigin, 'Too many feedback submissions. Please try again later.');
        }
        return handleFeedback(request, env, safeOrigin);
      }

      if (!env.ANTHROPIC_API_KEY) {
        return new Response(
          JSON.stringify({ error: { message: 'Proxy not configured — API key missing.' } }),
          { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders(safeOrigin) } }
        );
      }

      /* Abuse protection — checked before spending any API credits. Per-IP
         first (cheap, catches the common case), then the daily global cap
         (catches a distributed attack spread across many IPs). */
      const ipLimit = await checkAndIncrement(env, `ip:${ip}`, IP_LIMIT_PER_HOUR, IP_LIMIT_WINDOW_SECONDS);
      if (ipLimit.blocked) {
        return rateLimitedResponse(safeOrigin, 'Too many requests from this connection. Please try again in an hour.');
      }

      const today = new Date().toISOString().slice(0, 10);
      const dailyLimit = await checkAndIncrement(env, `daily:${today}`, DAILY_GLOBAL_LIMIT, DAILY_WINDOW_SECONDS);
      if (dailyLimit.blocked) {
        return rateLimitedResponse(safeOrigin, 'This service has reached its daily capacity. Please try again tomorrow.');
      }

      const body = await request.text();

      const upstream = await fetch(ANTHROPIC_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': String(env.ANTHROPIC_API_KEY).trim(),
          'anthropic-version': request.headers.get('anthropic-version') || '2023-06-01',
        },
        body,
      });

      const responseBody = await upstream.text();

      return new Response(responseBody, {
        status: upstream.status,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(safeOrigin),
        },
      });
    } catch (e) {
      return new Response(
        JSON.stringify({ error: { message: 'Worker exception.', detail: String(e && e.stack || e && e.message || e) } }),
        { status: 502, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }
  },
};
