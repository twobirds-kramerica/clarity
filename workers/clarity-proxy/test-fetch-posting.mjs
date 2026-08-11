/**
 * Local regression suite for the /fetch-posting route (S-CAREER-COACH-POSTING-FETCH-001).
 *
 * Runs src/index.js in plain Node against the REAL upstream endpoints, with a
 * Map standing in for the RATELIMIT KV namespace. No wrangler, no deploy, no
 * Cloudflare account touched. Node 20+ supplies fetch, Request, Response and
 * AbortController, which is everything the route uses.
 *
 *   node test-fetch-posting.mjs
 *
 * Expected results are printed, not asserted, because the fixtures are live
 * third-party postings: a role that is open today can close, and then the
 * "live" cases legitimately flip to "expired". If a case flips, replace the
 * URL with a currently-open posting on the same platform rather than editing
 * the route to make the old one pass.
 *
 * Baseline recorded 2026-08-11 (all as expected):
 *   workday-live live/workday · workday-dead expired/workday
 *   ashby-live live/ashby · ashby-dead expired/ashby
 *   oracle-live live/oracle · oracle-dead expired/page (soft 404)
 *   greenhouse-live live/greenhouse · greenhouse-dead expired/greenhouse
 *   lever-live live/jsonld · lever-dead expired (HTTP 404)
 *   linkedin + indeed paste-required · bad-url HTTP 400 · dead-domain unreachable
 *   rate limit: first 429 on request 16 (cap 15/hour per IP)
 */
import worker from './src/index.js';

const store = new Map();
const env = {
  RATELIMIT: {
    async get(k) { return store.has(k) ? store.get(k) : null; },
    async put(k, v) { store.set(k, v); },
  },
};

let ipCounter = 0;
async function check(label, url) {
  ipCounter += 1;
  const req = new Request('https://clarity-proxy.example/fetch-posting', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://twobirds-kramerica.github.io',
      /* A fresh IP per case so the rate-limit test below starts clean. */
      'CF-Connecting-IP': '10.0.0.' + ipCounter,
    },
    body: JSON.stringify({ url }),
  });
  const res = await worker.fetch(req, env);
  const body = await res.json();
  if (body.error) {
    console.log(`\n[${label}] HTTP ${res.status} error: ${body.error.message}`);
    return;
  }
  console.log(`\n[${label}] verdict=${body.verdict} source=${body.source}`);
  console.log(`  title=${JSON.stringify(body.title)} company=${JSON.stringify(body.company)} posted=${body.postedOn}`);
  console.log(`  completeness=${body.completeness.level} chars=${body.completeness.chars} aggregator=${body.aggregator}`);
  console.log(`  notes=${JSON.stringify(body.notes)}`);
  console.log(`  message=${body.message}`);
  console.log(`  text[0:110]=${JSON.stringify(body.text.slice(0, 110))}`);
}

const cases = [
  ['workday-live',    'https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/Vietnam-Hanoi/Director--Engineering---Software-Engineering_JR2021061'],
  ['workday-dead',    'https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/Vietnam-Hanoi/Totally--Made--Up--Role_JR0000000'],
  ['ashby-live',      'https://jobs.ashbyhq.com/ashby/7458d4e9-da2e-47bd-98cb-adfda43d42b2'],
  ['ashby-dead',      'https://jobs.ashbyhq.com/ashby/00000000-0000-0000-0000-000000000000'],
  ['oracle-live',     'https://eeho.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001/job/330961/'],
  ['oracle-dead',     'https://eeho.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001/job/999999999/'],
  ['greenhouse-live', 'https://job-boards.greenhouse.io/anthropic/jobs/5023394008'],
  ['greenhouse-dead', 'https://job-boards.greenhouse.io/anthropic/jobs/1'],
  ['lever-live',      'https://jobs.lever.co/leverdemo/33538a2f-d27d-4a96-8f05-fa4b0e4d940e'],
  ['lever-dead',      'https://jobs.lever.co/leverdemo/00000000-0000-0000-0000-000000000000'],
  ['linkedin',        'https://www.linkedin.com/jobs/view/4000000000/'],
  ['indeed',          'https://ca.indeed.com/viewjob?jk=abc123'],
  ['bad-url',         'not-a-url'],
  ['dead-domain',     'https://this-domain-does-not-exist-tb.example/job/1'],
];

for (const [label, url] of cases) {
  try { await check(label, url); }
  catch (e) { console.log(`\n[${label}] THREW: ${(e && e.stack) || e}`); }
}

/* Rate limit: 15 per hour per IP, same fixed-window KV pattern as the paid
   routes. A malformed URL is used so no upstream request is made. */
let tripped = null;
for (let i = 0; i < 20; i++) {
  const res = await worker.fetch(new Request('https://clarity-proxy.example/fetch-posting', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://twobirds-kramerica.github.io',
      'CF-Connecting-IP': '198.51.100.7',
    },
    body: JSON.stringify({ url: 'not-a-url' }),
  }), env);
  if (res.status === 429) { tripped = i + 1; break; }
}
console.log(`\n[rate-limit] first 429 on request #${tripped} (cap is 15/hour per IP)`);
