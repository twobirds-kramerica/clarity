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
 */

const ALLOWED_ORIGIN = 'https://twobirds-kramerica.github.io';
const ANTHROPIC_API  = 'https://api.anthropic.com/v1/messages';

/* Feedback limits — keep entries small and PII-light */
const FEEDBACK_MAX_MESSAGE = 4000;
const FEEDBACK_MAX_FIELD   = 300;

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
    const origin = request.headers.get('Origin') || '';
    const safeOrigin = origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(safeOrigin) });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const url = new URL(request.url);
    if (url.pathname === '/feedback') {
      return handleFeedback(request, env, safeOrigin);
    }

    if (!env.ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: { message: 'Proxy not configured — API key missing.' } }),
        { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders(safeOrigin) } }
      );
    }

    const body = await request.text();

    const upstream = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
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
  },
};
