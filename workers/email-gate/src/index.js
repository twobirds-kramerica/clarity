/**
 * Clarity Email Gate — Cloudflare Worker
 *
 * POST /capture-email    { email: "...", source: "pdf-download" }
 *   → validates, stores in KV (if bound), returns 200 JSON
 *   → CORS-enabled for GitHub Pages origin
 *
 * GET /health
 *   → { ok: true }
 *
 * Origin: D3 verbal unlock 2026-06-27.
 * Migration path: swap KV for Formgrid or sovereign VPS at scale.
 */

const ALLOWED_ORIGINS = [
  'https://twobirds-kramerica.github.io',
  'http://localhost:8765',
  'http://localhost:9100',
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function isValidEmail(email) {
  return typeof email === 'string' &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    email.length <= 254;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    // Health check
    if (url.pathname === '/health') {
      return Response.json({ ok: true }, { headers: cors });
    }

    // Email capture
    if (url.pathname === '/capture-email' && request.method === 'POST') {
      let body;
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: 'Invalid JSON' }, { status: 400, headers: cors });
      }

      const email = (body.email || '').trim().toLowerCase();
      if (!isValidEmail(email)) {
        return Response.json({ error: 'Invalid email' }, { status: 422, headers: cors });
      }

      const source = (body.source || 'unknown').slice(0, 50);
      const ts = new Date().toISOString();

      // Store in KV if bound (optional — worker functions without KV)
      if (env.EMAILS) {
        const key = `${ts}-${email.replace(/[^a-z0-9@.]/g, '_')}`;
        await env.EMAILS.put(key, JSON.stringify({ email, source, ts }), {
          expirationTtl: 60 * 60 * 24 * 365, // 1 year
        });
      }

      // Optional: forward to external webhook (Formgrid, Notion, etc.)
      if (env.EMAIL_STORAGE_URL) {
        try {
          await fetch(env.EMAIL_STORAGE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, source, ts }),
          });
        } catch {
          // Non-fatal — email is already in KV
        }
      }

      return Response.json({ ok: true, captured: true }, { headers: cors });
    }

    return Response.json({ error: 'Not found' }, { status: 404, headers: cors });
  },
};
