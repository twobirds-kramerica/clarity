/**
 * clarity-proxy — Cloudflare Worker
 *
 * Routes:
 *   POST /          — forwards Anthropic API calls from
 *                     twobirds-kramerica.github.io/clarity/ with the
 *                     server-side key (the Clarity built-in provider).
 *   POST /career-coach — same forwarding for the Career Coach built-in
 *                     provider (v2 lab), with its OWN per-IP and daily
 *                     rate-limit buckets so one product cannot exhaust
 *                     the other's capacity. Added 2026-07-11 (ADR-0029).
 *   POST /feedback  — accepts beta feedback from any twobirds-kramerica
 *                     GitHub Pages product and stores it in the
 *                     twobirds-beta-feedback KV namespace. No PII beyond
 *                     an optional reply-to email. No third-party calls.
 *   POST /fetch-posting — server-side job-posting fetch for Career Coach.
 *                     Takes { url }, runs the ATS Gate Zero paths (Workday
 *                     CXS, Oracle Recruiting, Ashby) or a plain fetch,
 *                     and returns clean posting text plus a real
 *                     live-or-dead verdict. Spends no Anthropic credits;
 *                     rate limited on its own KV buckets. Added
 *                     2026-08-11 (S-CAREER-COACH-POSTING-FETCH-001).
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
 * Origin allow-list (hardening audit 2026-07-16): browser requests whose
 * Origin header is present but not allow-listed (production GH Pages origin
 * or http://localhost:* for dev) are rejected 403 before any KV write or
 * Anthropic spend. Requests with no Origin (curl/server-to-server) pass —
 * the rate limits remain the boundary for those. See the comment in fetch().
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

/* Career Coach (/career-coach route) — separate buckets so Career Coach
   traffic never eats Clarity's capacity or vice versa. A verdict costs a
   fraction of a Clarity diagnostic (Haiku-class model, ~1.5K output tokens),
   so the caps can be a little more generous per IP. */
const CC_IP_LIMIT_PER_HOUR  = 10;
const CC_DAILY_GLOBAL_LIMIT = 300;

/* Career Coach GENERATION calls (tailored CV + cover letter, 2026-07-11):
   these are long-output Sonnet/Haiku calls (~4K max_tokens) that cost an
   order of magnitude more than a triage verdict, and in the product they
   are credit-gated client-side. The client gate is UX, not security, so
   the worker enforces its own tighter buckets: any /career-coach request
   asking for a big completion is counted against the generation caps.
   Worst-case daily exposure at these caps: 60 x ~$0.114 = ~$7. */
const CC_GEN_TOKEN_THRESHOLD  = 2500; // max_tokens above this = generation-class call
const CC_GEN_IP_LIMIT_PER_HOUR = 5;
const CC_GEN_DAILY_GLOBAL_LIMIT = 60;

/* Career Coach POSTING FETCH (/fetch-posting, 2026-08-11). Costs no
   Anthropic credits — the spend here is Worker subrequests and egress, so
   the caps sit between the cheap /feedback route and the paid ones. A real
   user checks a handful of postings in a sitting; a scraper pointing this
   at a crawl loop gets cut off. Same fixed-window KV pattern as every
   other bucket above, own key prefix so it cannot starve the paid routes. */
const CC_FETCH_IP_LIMIT_PER_HOUR  = 15;
const CC_FETCH_DAILY_GLOBAL_LIMIT = 400;
const FETCH_TIMEOUT_MS   = 12000;  // per upstream request
/* Read cap. Sized off real responses, not a guess: an Ashby job board with
   59 postings and full descriptions is 1.9 MB (measured 2026-08-11), and a
   truncated JSON body parses to nothing, which would have reported a live
   posting as absent. Truncation is flagged so the JSON paths fail visibly
   instead of quietly. */
const FETCH_MAX_CHARS    = 4000000; // stop reading a response body past this
const POSTING_MAX_CHARS  = 40000;  // cap on the text handed back to the page

/* JD-completeness gate. Thresholds and truncation markers are lifted from
   hal-stack/job-search/jd-completeness-check.py so the page and the agent
   side apply the SAME bar — change them there and here together. */
const JD_HARD_FLOOR = 800;   // below this = almost certainly truncated
const JD_SOFT_FLOOR = 1400;  // below this = suspiciously short
const JD_TRUNCATION_MARKERS = ['see more', '...more', 'show more', '…more', 'read more', 'see full'];

/* Hosts that cannot be fetched from a Worker, so the page must say so
   plainly rather than fail in a way that reads as the tool being broken.
   LinkedIn gates the posting body behind authentication and a "see more"
   expander, and blocks datacentre-origin requests; Cloudflare Workers are
   datacentre origin by definition. Indeed and Glassdoor answer 403 to the
   same class of request (verified 2026-08-11: Indeed returned 403). For
   every host here the honest answer is "paste the text instead". */
const PASTE_ONLY_HOSTS = [
  { host: 'linkedin.com',  label: 'LinkedIn' },
  { host: 'indeed.com',    label: 'Indeed' },
  { host: 'glassdoor.com', label: 'Glassdoor' },
  { host: 'glassdoor.ca',  label: 'Glassdoor' },
];

/* Job boards that republish an employer's posting. This is now the only
   copy of the list: the duplicate in career-coach/v2-lab/js/coach-v2.js was
   removed when that page stopped guessing and started calling this route.
   A hit is a caution, not a verdict: a posting can be live and a repost. */
const AGGREGATOR_DOMAINS = [
  'jobgether.com', 'bebee.com', 'indeed.com', 'ziprecruiter.com',
  'jobted.com', 'glassdoor.com', 'monster.ca', 'monster.com',
  'careerbuilder.ca', 'careerbuilder.com', 'simplyhired.ca', 'simplyhired.com',
  'talent.com', 'jooble.org', 'eluta.ca', 'workopolis.com', 'adzuna.ca',
];

/* Phrases employers and boards use when a posting is closed. Only matched
   against the extracted posting text, and only deliberately specific
   phrasings — a loose match here would call live postings dead. */
const EXPIRED_PHRASES = [
  'no longer accepting applications',
  'this job is no longer available',
  'this position is no longer available',
  'this posting is no longer available',
  'job posting is no longer available',
  'this posting has expired',
  'this job has expired',
  'position has been filled',
  'this position has been filled',
  'the job you are looking for is no longer',
  'we are no longer accepting applications',
];

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

/* ══════════════════════════════════════════════════════════════════════
   /fetch-posting — server-side posting fetch + liveness verdict
   (S-CAREER-COACH-POSTING-FETCH-001, 2026-08-11)

   Why it lives in the Worker and not in the page: the ATS JSON endpoints
   below send no CORS headers, so a static page on github.io cannot call
   them. The Worker can. The page previously string-matched the URL against
   a hard-coded board list and then asked the user to tick "I opened it,
   the posting is live" — that was never verification and was not described
   as such after the 2026-08-11 copy correction.

   Response shape (always 200 unless rate limited or malformed input):
     {
       verdict: 'live' | 'expired' | 'paste-required' | 'unreachable' | 'unknown',
       source:  'workday' | 'oracle' | 'ashby' | 'jsonld' | 'page' | 'none',
       url, canonicalUrl, title, company, postedOn,
       text,           // clean posting text, '' when none could be read
       completeness: { level: 'ok'|'warn'|'block', chars, reason },
       aggregator: 'indeed.com' | null,
       message,        // one plain-language line for the user
       notes: []       // short machine-readable reasons, for debugging
     }
   The verdict is never asserted beyond what was actually observed:
   'unknown' is a real, expected outcome and the page treats it as such.
   ══════════════════════════════════════════════════════════════════════ */

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); }
  catch (e) { return ''; }
}

function detectAggregator(host) {
  if (!host) return null;
  var hit = null;
  AGGREGATOR_DOMAINS.some(function (d) {
    if (host.indexOf(d) !== -1) { hit = d; return true; }
    return false;
  });
  return hit;
}

function pasteOnlyHost(host) {
  if (!host) return null;
  var hit = null;
  PASTE_ONLY_HOSTS.some(function (e) {
    if (host === e.host || host.endsWith('.' + e.host)) { hit = e; return true; }
    return false;
  });
  return hit;
}

/* Minimal entity decoding — enough for posting bodies, which are ordinary
   prose. Anything exotic stays as-is rather than being guessed at. */
function decodeEntities(s) {
  return String(s)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;|&rsquo;/gi, "'")
    .replace(/&lsquo;/gi, "'")
    .replace(/&ldquo;|&rdquo;/gi, '"')
    .replace(/&mdash;/gi, ', ')
    .replace(/&ndash;/gi, '-')
    .replace(/&#(\d+);/g, function (m, n) {
      var code = parseInt(n, 10);
      return (code > 31 && code < 1114112) ? String.fromCodePoint(code) : ' ';
    });
}

/* HTML to readable text. Block-level tags become line breaks so bullet
   lists survive as bullet lists — the completeness gate counts characters,
   and the model downstream reads structure. */
function htmlToText(html) {
  if (!html) return '';
  var s = String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|ul|ol)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);
  return s
    .replace(/[ \t ]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* Same thresholds as hal-stack/job-search/jd-completeness-check.py. */
function checkJdCompleteness(text) {
  var t = String(text || '').trim();
  var n = t.length;
  var lower = t.toLowerCase();
  var marker = null;
  JD_TRUNCATION_MARKERS.some(function (m) {
    if (lower.indexOf(m) !== -1) { marker = m; return true; }
    return false;
  });
  if (marker || n < JD_HARD_FLOOR) {
    var why = [];
    if (marker) why.push('it still contains "' + marker + '"');
    if (n < JD_HARD_FLOOR) why.push('only ' + n + ' characters came back (a full posting is usually 1,500 or more)');
    return {
      level: 'block', chars: n,
      reason: 'This looks like part of the posting, not all of it: ' + why.join(' and ') +
              '. Open the posting, expand it, and paste the whole thing before you rely on the verdict.',
    };
  }
  if (n < JD_SOFT_FLOOR) {
    return {
      level: 'warn', chars: n,
      reason: 'Short posting (' + n + ' characters). It may be complete, or it may be a summary. Worth a glance at the original.',
    };
  }
  return { level: 'ok', chars: n, reason: 'Full posting read (' + n + ' characters).' };
}

function looksExpired(text) {
  var lower = String(text || '').toLowerCase();
  var hit = null;
  EXPIRED_PHRASES.some(function (p) {
    if (lower.indexOf(p) !== -1) { hit = p; return true; }
    return false;
  });
  return hit;
}

/* One upstream request, with a hard timeout and a read cap. Never throws:
   a failure comes back as { error } so the caller can fall through to the
   next strategy instead of collapsing the whole route. */
async function fetchUpstream(url, options) {
  var opts = options || {};
  var controller = new AbortController();
  var timer = setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT_MS);
  try {
    var res = await fetch(url, {
      method: opts.method || 'GET',
      headers: Object.assign({
        /* A plain browser Accept/UA. Nothing deceptive about the origin:
           the request still comes from Cloudflare's network and hosts that
           refuse that are handled as paste-required, not worked around. */
        'User-Agent': 'Mozilla/5.0 (compatible; TwoBirdsCareerCoach/1.0; +https://twobirds-kramerica.github.io/career-coach/)',
        'Accept': opts.accept || 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-CA,en;q=0.9',
      }, opts.headers || {}),
      body: opts.body,
      redirect: 'follow',
      signal: controller.signal,
    });
    var body = await res.text();
    var truncated = body.length > FETCH_MAX_CHARS;
    if (truncated) body = body.slice(0, FETCH_MAX_CHARS);
    return { status: res.status, url: res.url || url, body: body, truncated: truncated };
  } catch (e) {
    return { error: String((e && e.name) === 'AbortError' ? 'timeout' : (e && e.message) || e) };
  } finally {
    clearTimeout(timer);
  }
}

function parseJson(text) {
  try { return JSON.parse(text); } catch (e) { return null; }
}

/* ── Workday (*.myworkdayjobs.com) ─────────────────────────────────────
   Per hal-stack/job-search/ats-gate-zero.md. Two CXS calls, both public
   JSON, no browser: the job-detail path gives the full description and
   whether the requisition still accepts applications; the documented
   search POST is the fallback when the URL shape is unusual, and answers
   liveness only (Workday drops closed postings from search). */
async function tryWorkday(url) {
  var u;
  try { u = new URL(url); } catch (e) { return null; }
  var host = u.hostname;
  var tenant = host.split('.')[0];
  var segs = u.pathname.split('/').filter(Boolean);
  var jobIdx = segs.findIndex(function (s) { return s === 'job' || s === 'details'; });

  if (jobIdx > 0) {
    var siteId = segs[jobIdx - 1];
    var rest = segs.slice(jobIdx + 1).join('/');
    var detail = await fetchUpstream(
      'https://' + host + '/wday/cxs/' + tenant + '/' + siteId + '/job/' + rest,
      { accept: 'application/json' }
    );
    if (!detail.error && detail.status === 200) {
      var data = parseJson(detail.body);
      var info = data && data.jobPostingInfo;
      if (info) {
        var text = htmlToText(info.jobDescription || '');
        var closed = info.canApply === false || info.posted === false;
        return {
          source: 'workday',
          verdict: closed ? 'expired' : 'live',
          title: info.title || '',
          company: (data.hiringOrganization && data.hiringOrganization.name) || tenant,
          postedOn: info.startDate || info.postedOn || '',
          canonicalUrl: info.externalUrl || url,
          text: text,
          notes: ['workday-cxs-job-detail', closed ? 'requisition-closed' : 'requisition-open'],
        };
      }
    }
    if (!detail.error && (detail.status === 404 || detail.status === 410)) {
      return {
        source: 'workday', verdict: 'expired', text: '',
        notes: ['workday-cxs-job-detail-' + detail.status],
      };
    }
  }

  /* Fallback: the documented search POST. Keywords come from the URL slug,
     which is how Workday builds its own job URLs. Presence in search
     results means open; absence is not proof of closure, because the
     keywords may simply not match, so that case returns 'unknown'. */
  var siteGuess = jobIdx > 0 ? segs[jobIdx - 1] : segs[segs.length - 1];
  var slug = segs[segs.length - 1] || '';
  var keywords = slug.replace(/_[A-Za-z0-9-]+$/, '').replace(/[-_]+/g, ' ').trim().slice(0, 80);
  if (!keywords) return null;
  var search = await fetchUpstream(
    'https://' + host + '/wday/cxs/' + tenant + '/' + siteGuess + '/jobs',
    {
      method: 'POST', accept: 'application/json',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appliedFacets: {}, limit: 20, offset: 0, searchText: keywords }),
    }
  );
  if (search.error || search.status !== 200) return null;
  var sdata = parseJson(search.body);
  var postings = (sdata && sdata.jobPostings) || [];
  var match = postings.find(function (p) {
    return p.externalPath && u.pathname.indexOf(p.externalPath) !== -1;
  });
  if (match) {
    return {
      source: 'workday', verdict: 'live', title: match.title || '',
      company: tenant, postedOn: match.postedOn || '', text: '',
      notes: ['workday-cxs-search-hit', 'no-description-from-search'],
    };
  }
  return {
    source: 'workday', verdict: 'unknown', text: '',
    notes: ['workday-cxs-search-no-match'],
  };
}

/* ── Oracle Recruiting (*.oraclecloud.com) ─────────────────────────────
   Per ats-gate-zero.md: enumerate the site's live requisitions and check
   whether this one is among them. The detail endpoint supplies the
   description text. Enumeration is capped, so a site with more open
   requisitions than the cap yields 'unknown' rather than a false 'expired'. */
async function tryOracle(url) {
  var u;
  try { u = new URL(url); } catch (e) { return null; }
  var segs = u.pathname.split('/').filter(Boolean);
  var jobIdx = segs.indexOf('job');
  var siteIdx = segs.indexOf('sites');
  var reqId = jobIdx !== -1 ? (segs[jobIdx + 1] || '').split('?')[0] : '';
  var siteNumber = siteIdx !== -1 ? segs[siteIdx + 1] : 'CX_1001';
  if (!reqId) return null;

  var out = { source: 'oracle', verdict: 'unknown', text: '', notes: [], canonicalUrl: url };

  var detailUrl = 'https://' + u.hostname +
    '/hcmRestApi/resources/latest/recruitingCEJobRequisitionDetails' +
    '?expand=all&onlyData=true&finder=ById;Id=%22' + encodeURIComponent(reqId) +
    '%22,siteNumber=' + encodeURIComponent(siteNumber);
  var detail = await fetchUpstream(detailUrl, { accept: 'application/json' });
  if (!detail.error && detail.status === 200) {
    var ddata = parseJson(detail.body);
    var item = ddata && ddata.items && ddata.items[0];
    if (item) {
      out.title = item.Title || '';
      out.text = htmlToText(
        [item.ExternalDescriptionStr, item.CorporateDescriptionStr, item.OrganizationDescriptionStr]
          .filter(Boolean).join('\n\n')
      );
      out.notes.push('oracle-detail-ok');
    }
  }

  var listUrl = 'https://' + u.hostname +
    '/hcmRestApi/resources/latest/recruitingCEJobRequisitions' +
    '?onlyData=true&expand=requisitionList&finder=findReqs;siteNumber=' +
    encodeURIComponent(siteNumber) + ',limit=200';
  var list = await fetchUpstream(listUrl, { accept: 'application/json' });
  if (!list.error && list.status === 200 && !list.truncated) {
    var ldata = parseJson(list.body);
    var block = ldata && ldata.items && ldata.items[0];
    var reqs = (block && block.requisitionList) || [];
    var total = block && Number(block.TotalJobsCount);
    var present = reqs.some(function (r) { return String(r.Id) === String(reqId); });
    if (present) {
      out.verdict = 'live';
      out.notes.push('oracle-enumeration-present');
      var row = reqs.find(function (r) { return String(r.Id) === String(reqId); });
      if (row) { out.postedOn = row.PostedDate || ''; out.title = out.title || row.Title || ''; }
    } else if (total && total > reqs.length) {
      out.notes.push('oracle-enumeration-truncated-' + reqs.length + '-of-' + total);
    } else {
      out.verdict = 'expired';
      out.notes.push('oracle-enumeration-absent');
    }
  }
  if (!out.text && out.verdict === 'unknown') return null;
  return out;
}

/* ── Ashby (jobs.ashbyhq.com/<org>/<postingId>) ────────────────────────
   Per ats-gate-zero.md: the public job-board API lists every live posting
   with its description. Present means live, absent means closed. */
async function tryAshby(url) {
  var u;
  try { u = new URL(url); } catch (e) { return null; }
  var segs = u.pathname.split('/').filter(Boolean);
  var org = segs[0];
  var postingId = segs[1] || '';
  if (!org) return null;
  var res = await fetchUpstream(
    'https://api.ashbyhq.com/posting-api/job-board/' + encodeURIComponent(org) + '?includeCompensation=true',
    { accept: 'application/json' }
  );
  if (res.error || res.status !== 200) return null;
  var data = res.truncated ? null : parseJson(res.body);
  if (!data) {
    /* Never report "absent" off a body we could not fully parse — that is
       exactly how a live posting gets called dead. */
    return {
      source: 'ashby', verdict: 'unknown', text: '',
      notes: [res.truncated ? 'ashby-board-response-too-large' : 'ashby-board-unparseable'],
    };
  }
  var jobs = data.jobs || [];
  var job = jobs.find(function (j) {
    return j.id === postingId || (j.jobUrl && j.jobUrl.indexOf(postingId) !== -1);
  });
  if (!job) {
    return {
      source: 'ashby', verdict: postingId ? 'expired' : 'unknown', text: '',
      notes: [postingId ? 'ashby-posting-absent' : 'ashby-no-posting-id-in-url'],
    };
  }
  return {
    source: 'ashby',
    verdict: job.isListed === false ? 'expired' : 'live',
    title: job.title || '',
    company: org,
    postedOn: job.publishedAt || '',
    canonicalUrl: job.jobUrl || url,
    text: (job.descriptionPlain && String(job.descriptionPlain)) || htmlToText(job.descriptionHtml || ''),
    notes: ['ashby-board-api'],
  };
}

/* ── Greenhouse (job-boards.greenhouse.io/<org>/jobs/<id>) ─────────────
   Not in ats-gate-zero.md when this route was written; verified live
   2026-08-11 and added to that file in the same sprint. Greenhouse is the
   most common board in the postings Career Coach sees, and its public
   board API answers 200 with the full description or 404 once the job is
   gone. Without it a live Greenhouse posting reads as 'unknown', because
   a pulled job silently redirects to the board index with a 200. */
async function tryGreenhouse(url) {
  var u;
  try { u = new URL(url); } catch (e) { return null; }
  var segs = u.pathname.split('/').filter(Boolean);
  var jobsIdx = segs.indexOf('jobs');
  if (jobsIdx < 1) return null;
  var org = segs[jobsIdx - 1];
  var jobId = (segs[jobsIdx + 1] || '').split('?')[0];
  if (!org || !jobId) return null;
  var res = await fetchUpstream(
    'https://boards-api.greenhouse.io/v1/boards/' + encodeURIComponent(org) + '/jobs/' + encodeURIComponent(jobId),
    { accept: 'application/json' }
  );
  if (res.error) return null;
  if (res.status === 404) {
    return { source: 'greenhouse', verdict: 'expired', text: '', notes: ['greenhouse-api-404'] };
  }
  if (res.status !== 200) return null;
  var job = parseJson(res.body);
  if (!job || !job.title) return null;
  return {
    source: 'greenhouse',
    verdict: 'live',
    title: job.title || '',
    company: job.company_name || org,
    postedOn: job.first_published || job.updated_at || '',
    canonicalUrl: job.absolute_url || url,
    /* Greenhouse returns the description with its HTML entity-encoded, so
       it has to be decoded before the tag stripper can see any tags. */
    text: htmlToText(decodeEntities(job.content || '')),
    notes: ['greenhouse-board-api'],
  };
}

/* ── Anything else: fetch the page ─────────────────────────────────────
   Prefer the schema.org JobPosting block most careers pages and ATS
   platforms already publish (Greenhouse, Lever, SmartRecruiters and most
   employer sites do). It carries the description, the title, the employer
   and often validThrough, which is a real expiry signal. Falling back to
   whole-page text is honest but noisier, and the completeness gate is what
   catches a page that returned navigation instead of a posting. */
function extractJsonLdJobPosting(html) {
  var re = /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  var m;
  while ((m = re.exec(html)) !== null) {
    var parsed = parseJson(m[1].trim());
    if (!parsed) continue;
    var candidates = Array.isArray(parsed) ? parsed : [parsed];
    if (parsed['@graph']) candidates = candidates.concat(parsed['@graph']);
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      if (c && (c['@type'] === 'JobPosting' ||
        (Array.isArray(c['@type']) && c['@type'].indexOf('JobPosting') !== -1))) {
        return c;
      }
    }
  }
  return null;
}

async function tryGenericPage(url) {
  var res = await fetchUpstream(url);
  if (res.error) {
    return {
      source: 'none', verdict: 'unreachable', text: '',
      notes: ['fetch-' + res.error],
    };
  }
  if (res.status === 404 || res.status === 410) {
    return { source: 'none', verdict: 'expired', text: '', notes: ['http-' + res.status] };
  }
  if (res.status === 401 || res.status === 403 || res.status === 429 || res.status === 999) {
    return { source: 'none', verdict: 'paste-required', text: '', notes: ['http-' + res.status] };
  }
  if (res.status >= 500 || res.status !== 200) {
    return { source: 'none', verdict: 'unreachable', text: '', notes: ['http-' + res.status] };
  }

  var ld = extractJsonLdJobPosting(res.body);
  if (ld) {
    var ldText = htmlToText(ld.description || '');
    var out = {
      source: 'jsonld',
      verdict: 'live',
      title: ld.title || '',
      company: (ld.hiringOrganization && ld.hiringOrganization.name) || '',
      postedOn: ld.datePosted || '',
      canonicalUrl: res.url,
      text: ldText,
      notes: ['schema-org-jobposting'],
    };
    if (ld.validThrough) {
      var through = Date.parse(ld.validThrough);
      if (!isNaN(through) && through < Date.now()) {
        out.verdict = 'expired';
        out.notes.push('validThrough-past');
      }
    }
    var ldExpired = looksExpired(ldText);
    if (ldExpired) { out.verdict = 'expired'; out.notes.push('expired-phrase'); }
    return out;
  }

  var pageText = htmlToText(res.body);
  var expiredHit = looksExpired(pageText);
  /* Soft 404: some ATS platforms answer 200 with a short "page not found"
     shell for a requisition that has been pulled. Only treated as dead when
     the page is short as well as matching, so a long posting that happens
     to contain the phrase somewhere is not misread. */
  if (!expiredHit && pageText.length < 400 && /page not found|page you are looking for|404 error/i.test(pageText)) {
    return { source: 'page', verdict: 'expired', canonicalUrl: res.url, text: '', notes: ['soft-404'] };
  }
  return {
    source: 'page',
    /* A 200 with readable page text is evidence the URL resolves, not
       proof this specific requisition is open. Say 'unknown' and let the
       page tell the user to confirm, rather than overclaim 'live'. */
    verdict: expiredHit ? 'expired' : 'unknown',
    canonicalUrl: res.url,
    text: pageText,
    notes: expiredHit ? ['page-text', 'expired-phrase'] : ['page-text', 'no-structured-data'],
  };
}

function messageFor(result) {
  switch (result.verdict) {
    case 'live':
      return 'Checked just now: this posting is still open.';
    case 'expired':
      return 'This posting is closed. Applying to it is time you will not get back; find the role on the employer\'s own careers page, or move on.';
    case 'paste-required':
      return result.pasteLabel
        ? (result.pasteLabel + ' does not let us read a posting from a server, so we cannot check this one for you. Open it, expand the full description, and paste the text below.')
        : 'This site refused the request, so we could not read the posting. Open it and paste the text below.';
    case 'unreachable':
      return 'We could not reach that link. Check it in a browser, then paste the posting text below.';
    default:
      return 'We reached the page but could not confirm whether the role is still open. Open it once to check, then carry on.';
  }
}

async function handleFetchPosting(request, env, safeOrigin) {
  var payload;
  try { payload = await request.json(); }
  catch (e) { payload = null; }
  var url = payload && typeof payload.url === 'string' ? payload.url.trim() : '';

  var parsed = null;
  try { parsed = new URL(url); } catch (e) { parsed = null; }
  if (!parsed || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
    return new Response(
      JSON.stringify({ error: { message: 'That does not look like a job posting link. It should start with https://' } }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders(safeOrigin) } }
    );
  }

  var host = hostOf(url);
  var aggregator = detectAggregator(host);
  var result;

  var blocked = pasteOnlyHost(host);
  if (blocked) {
    /* Named up front rather than discovered as a confusing failure. This
       is the LinkedIn case the sprint required be designed around. */
    result = {
      source: 'none', verdict: 'paste-required', text: '',
      pasteLabel: blocked.label, notes: ['host-cannot-be-fetched-server-side'],
    };
  } else if (/\.myworkdayjobs\.com$/.test(host)) {
    result = await tryWorkday(url);
  } else if (host === 'jobs.ashbyhq.com') {
    result = await tryAshby(url);
  } else if (/\.oraclecloud\.com$/.test(host)) {
    result = await tryOracle(url);
  } else if (/(^|\.)greenhouse\.io$/.test(host)) {
    result = await tryGreenhouse(url);
  }

  if (!result) result = await tryGenericPage(url);

  var text = String(result.text || '').slice(0, POSTING_MAX_CHARS);
  var completeness = checkJdCompleteness(text);

  /* A live verdict with no readable text is still useful — it saves the
     wasted application — but the user must paste the posting for the
     analysis to mean anything. Say that rather than implying we have it. */
  var message = messageFor(result);
  if (result.verdict === 'live' && completeness.level === 'block') {
    message += ' We could not read the full description from here, so paste the posting text below.';
  }

  return new Response(JSON.stringify({
    verdict: result.verdict,
    source: result.source || 'none',
    url: url,
    canonicalUrl: result.canonicalUrl || url,
    title: result.title || '',
    company: result.company || '',
    postedOn: result.postedOn || '',
    text: text,
    completeness: completeness,
    aggregator: aggregator,
    message: message,
    notes: result.notes || [],
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(safeOrigin) },
  });
}

export default {
  async fetch(request, env) {
    try {
      const origin = request.headers.get('Origin') || '';
      /* Origin allow-list (hardening audit 2026-07-16). Two layers:
         1. CORS headers are only ever issued for the allow-listed production
            origin (both Clarity and Career Coach are served from the same
            GitHub Pages origin) or http://localhost:* for local dev/QA.
         2. A browser request carrying a NON-allow-listed Origin is rejected
            with 403 before any rate-limit KV write or Anthropic spend —
            CORS alone would only stop the page READING the response, but a
            no-preflight "simple" POST would still fire and burn credits.
         Note the honest limits: CORS + Origin checks are browser-enforced
         signals only. Non-browser clients (curl, scripts) send no Origin —
         or can forge one — and pass straight through; for those, the rate
         limits below remain the actual spend-protection boundary, exactly
         as the original design intended. This is additive defense against
         drive-by third-party WEBSITES, not a replacement for rate limits. */
      const isLocalDev = /^http:\/\/localhost(:\d+)?$/.test(origin);
      const originAllowed = origin === '' || origin === ALLOWED_ORIGIN || isLocalDev;
      const safeOrigin = (origin === ALLOWED_ORIGIN || isLocalDev) ? origin : ALLOWED_ORIGIN;

      if (!originAllowed) {
        /* No CORS headers on purpose — the browser blocks the response,
           and nothing downstream (KV counters, Anthropic) is touched. */
        return new Response(
          JSON.stringify({ error: { message: 'Origin not allowed.' } }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      }

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

      /* Posting fetch spends no Anthropic credits, so it is handled before
         the API-key check — the route must keep working even if the key is
         missing or the account is out of funds. Its own KV buckets, same
         fixed-window pattern as every other limit in this file. */
      if (url.pathname === '/fetch-posting') {
        const fetchIpLimit = await checkAndIncrement(env, `cc:fetch:ip:${ip}`, CC_FETCH_IP_LIMIT_PER_HOUR, IP_LIMIT_WINDOW_SECONDS);
        if (fetchIpLimit.blocked) {
          return rateLimitedResponse(safeOrigin, 'Too many posting checks from this connection. Please try again in an hour, or paste the posting text instead.');
        }
        const fetchDay = new Date().toISOString().slice(0, 10);
        const fetchDailyLimit = await checkAndIncrement(env, `cc:fetch:daily:${fetchDay}`, CC_FETCH_DAILY_GLOBAL_LIMIT, DAILY_WINDOW_SECONDS);
        if (fetchDailyLimit.blocked) {
          return rateLimitedResponse(safeOrigin, 'Posting checks have reached their daily capacity. Please try again tomorrow, or paste the posting text instead.');
        }
        return handleFetchPosting(request, env, safeOrigin);
      }

      if (!env.ANTHROPIC_API_KEY) {
        return new Response(
          JSON.stringify({ error: { message: 'Proxy not configured — API key missing.' } }),
          { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders(safeOrigin) } }
        );
      }

      /* Abuse protection — checked before spending any API credits. Per-IP
         first (cheap, catches the common case), then the daily global cap
         (catches a distributed attack spread across many IPs). The
         /career-coach route uses its own KV buckets and caps (ADR-0029)
         so the two products cannot exhaust each other's capacity. */
      const isCareerCoach = url.pathname === '/career-coach';

      /* Read the body up front so generation-class calls (big max_tokens)
         can be told apart from cheap triage verdicts and counted against
         their own, tighter buckets. Unparseable bodies are treated as
         generation-class (fail closed on the expensive tier). */
      const body = await request.text();
      let isGeneration = false;
      if (isCareerCoach) {
        try {
          const parsed = JSON.parse(body);
          isGeneration = Number(parsed && parsed.max_tokens) > CC_GEN_TOKEN_THRESHOLD;
        } catch (e) {
          isGeneration = true;
        }
      }

      const ipKey    = isCareerCoach ? (isGeneration ? `cc:gen:ip:${ip}` : `cc:ip:${ip}`) : `ip:${ip}`;
      const ipCap    = isCareerCoach ? (isGeneration ? CC_GEN_IP_LIMIT_PER_HOUR : CC_IP_LIMIT_PER_HOUR) : IP_LIMIT_PER_HOUR;
      const dailyCap = isCareerCoach ? (isGeneration ? CC_GEN_DAILY_GLOBAL_LIMIT : CC_DAILY_GLOBAL_LIMIT) : DAILY_GLOBAL_LIMIT;

      const ipLimit = await checkAndIncrement(env, ipKey, ipCap, IP_LIMIT_WINDOW_SECONDS);
      if (ipLimit.blocked) {
        return rateLimitedResponse(safeOrigin, 'Too many requests from this connection. Please try again in an hour.');
      }

      const today = new Date().toISOString().slice(0, 10);
      const dailyKey = isCareerCoach ? (isGeneration ? `cc:gen:daily:${today}` : `cc:daily:${today}`) : `daily:${today}`;
      const dailyLimit = await checkAndIncrement(env, dailyKey, dailyCap, DAILY_WINDOW_SECONDS);
      if (dailyLimit.blocked) {
        return rateLimitedResponse(safeOrigin, 'This service has reached its daily capacity. Please try again tomorrow, or add your own API key for unlimited use.');
      }

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
        { status: 502, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': ALLOWED_ORIGIN } }
      );
    }
  },
};
