/**
 * clarity-proxy — Cloudflare Worker
 * Accepts POST requests from twobirds-kramerica.github.io/clarity/
 * and forwards them to the Anthropic API with the server-side key.
 *
 * Deploy:
 *   cd workers/clarity-proxy
 *   wrangler deploy
 *   wrangler secret put ANTHROPIC_API_KEY
 *
 * Then update CLARITY_PROXY_URL in llm-provider.js with the deployed URL.
 */

const ALLOWED_ORIGIN = 'https://twobirds-kramerica.github.io';
const ANTHROPIC_API  = 'https://api.anthropic.com/v1/messages';

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin':  origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, anthropic-version',
  };
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
