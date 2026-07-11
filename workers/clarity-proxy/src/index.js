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
 *
 * Low-credit alert (S-CLARITY-CREDIT-ALERT, 2026-07-10): if Anthropic
 * returns a billing-related 4xx (out of credits / invalid key), this posts
 * one Slack alert (reusing the same webhook as Talon's Golden Ticket alerts)
 * and then stays silent for the rest of the day (RATELIMIT KV, key
 * `alert:lowcredit:{date}`) so a burst of failed requests doesn't spam the
 * channel. Requires the SLACK_WEBHOOK_URL secret:
 *   wrangler secret put SLACK_WEBHOOK_URL
 */

const ALLOWED_ORIGIN = 'https://twobirds-kramerica.github.io';
const ANTHROPIC_API  = 'https://api.anthropic.com/v1/messages';
const CLARITY_PER_SCAN_COST_NOTE =
  'Approx cost per diagnostic: a few cents (Sonnet 4.6, ~$3/$15 per million input/output tokens). $5 in credits covers roughly 100+ typical reports.';

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

/* Detects the billing-shaped errors Anthropic returns (out of credits,
   invalid/revoked key). Anthropic's error `type` field is stable API
   surface; the message-text check is a fallback in case the type ever
   changes shape. */
function isBillingError(status, responseText) {
  if (status !== 400 && status !== 401 && status !== 403) return false;
  const lower = responseText.toLowerCase();
  return (
    lower.includes('credit balance is too low') ||
    lower.includes('"type":"invalid_request_error"') && lower.includes('credit') ||
    lower.includes('invalid x-api-key') ||
    lower.includes('authentication_error')
  );
}

/* Fire-and-forget Slack alert, rate-limited to once per calendar day so a
   burst of failed requests during an outage doesn't spam the channel. Never
   throws — a notification failure must not affect the user-facing response. */
async function maybeAlertLowCredit(env, status, responseText) {
  if (!env.SLACK_WEBHOOK_URL) return;
  if (!isBillingError(status, responseText)) return;

  const today = new Date().toISOString().slice(0, 10);
  const alertKey = `alert:lowcredit:${today}`;
  const already = await env.RATELIMIT.get(alertKey);
  if (already) return;
  await env.RATELIMIT.put(alertKey, '1', { expirationTtl: DAILY_WINDOW_SECONDS });

  const message = [
    ':warning: *Clarity is down for real users* — the Anthropic API call just failed with a billing error.',
    `Status ${status}. This blocks every live diagnostic report on twobirds-kramerica.github.io/clarity/ until fixed.`,
    '',
    '*To fix:* console.anthropic.com/settings/billing -> Add funds (or check the key is still valid).',
    CLARITY_PER_SCAN_COST_NOTE,
    '',
    'This alert fires at most once per day even if many requests fail.',
  ].join('\n');

  try {
    await fetch(env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message }),
    });
  } catch (e) {
    /* Notification is best-effort — swallow errors, never affect the response. */
  }
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

      /* Best-effort, does not block the response to the user. */
      await maybeAlertLowCredit(env, upstream.status, responseBody);

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
