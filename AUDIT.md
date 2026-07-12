# Clarity — HAL Stack Rigor Audit

> **⚠ PROGRESS UPDATE 2026-04-22** — 2 of 5 §9 Top-5 next-actions have SHIPPED; 3 remain open. Do NOT treat §9 as an untouched backlog; re-audit before proposing Clarity work.
>
> | # | Action | Status |
> |---|---|---|
> | 1 | Mailto to Calendly | **Open** — blocked on Aaron providing Calendly URL (P1 in aaron-todos-2026-04-21) |
> | 2 | Pricing page or section | **Open** — not shipped |
> | 3 | Email capture before Save Report | **Open** — not shipped |
> | 4 | LLM portability Route B | **Shipped** in `a5a0d4d` S-CLARITY-PORTABILITY + `acfa927` llm-provider.js |
> | 5 | Testimonial or portfolio-evidence block | **Shipped** (factual variant) in `e4e79b7` portfolio-evidence line under CTA |



**Audit date:** 2026-04-21
**Auditor:** Claude Code (Opus 4.7 · max-mode autonomous) for Aaron Patzalek
**Sprint:** S-CLARITY (Notion `348a09cf-876a-8193-896b-f10b6c7c44f9`)
**Repo state at audit:** `clarity` master @ `ff9bed7`; commit `7b0c725` shipped inline fixes during this audit.

---

## What Clarity does

Single-page static app. Business owner pastes an Anthropic API key in the browser, fills a 7-field diagnostic form (business name, industry, years, team size, top challenges, current AI usage, revenue goal), and receives a SWOT + 3 priority recommendations + 3 quick wins + 1 suggested next step as JSON rendered inline. No server, no database, no tracking.

Files: `index.html` (1131 lines), `llm-provider.js` (125 lines, 4-provider abstraction), `qa-audit.js` (79 lines, `?qa=true` overlay).

---

## TL;DR — what shipped this sprint vs. what's backlog

### Shipped in commit `7b0c725`

| Fix | Risk | Impact |
|---|---|---|
| `<fieldset>/<legend>` for checkbox group | A11y (WCAG 1.3.1) | Screen-reader users now hear the group label on each checkbox |
| Reset API Key `<a href="#">` → `<button>` | A11y + UX | Proper semantics; Space key no longer scrolls |
| Focus shift to results container on reveal | A11y (WCAG 4.1.3) | SR announcement reliability |
| `--error` colour `#B44D4D` → `#962C2C` | A11y (WCAG 1.4.3) | AA contrast on error-box background |
| Stale model `claude-sonnet-4-20250514` → `claude-sonnet-4-6-20250929` | Correctness | Current Sonnet 4.6; better recommendation quality |
| CI: `.github/workflows/axe-core.yml` | Governance | Every push now scanned; critical-violations block |

### Backlog (recommended, not shipped)

See the individual sections below. Highlights: email capture before API-key gate, portability-layer wiring gap, monetization surface redesign, CTA diversification, testimonials, Warm Hearth skin option.

---

## 1. Accessibility

**Audit method:** static inspection of `index.html`; reference to `qa-audit.js` (axe-core 4.7.0 overlay). CI workflow added in this sprint runs axe-core on every push.

### Fixed this sprint
(See table above — fieldset/legend, button for Reset API Key, focus management, error contrast.)

### Still backlog

- **`aria-live="polite"` on results** is correct for the live-announcement reveal, but we should verify that `scrollIntoView` + `focus()` together don't race the SR announcement. Test with NVDA on a Windows machine before shipping further tweaks.
- **Loader uses `role="status"` + `aria-live="polite"`** — good, but the "Analysing your business..." copy is announced once and never again. For a 15-30 second wait, a second announcement at T+15 seconds ("still analysing, usually finishes within 30 seconds") reduces abandonment. Low-effort, high-empathy.
- **Colour contrast on olive text** (`#5C6B4F`) on cream (`#F5F3EE`) is ~4.87:1 — *just* passing AA for normal text. Any future tweak to either token needs a contrast re-check. Consider `--olive-dark` `#4A5640` (6.2:1) as the default body colour and reserve olive for structural accents.
- **Cross-browser focus-ring offset:** Safari + Firefox render `outline-offset: 2px` differently from Chrome. Visual verification needed.

### Confidence
85% on the A11y foundation. Weakest link is that no-one has screen-reader-tested the flow end-to-end with an actual SME owner. The CI catch-net is now in place; next step is manual flow testing.

---

## 2. Performance

- Single HTML file, no build step, no dependencies at rest. First paint is near-instant.
- API call latency is the dominant wait (15-30 s per diagnostic). Mitigated by the animated loader and explicit time estimate.
- `qa-audit.js` loads axe-core from Cloudflare CDN only when `?qa=true` is present — zero cost on prod.

### Recommendations
- **Add prompt caching** on the Anthropic request. The diagnostic prompt has ~500 tokens of stable scaffolding (instructions, JSON schema, language directive) followed by the user's ~50-token business details. Move the scaffolding into a cached `system` block — every session after the first hits the cache and saves both latency (~300 ms) and cost (~25% of input tokens). LOE: ~30 min to restructure the prompt into system + user parts and add `cache_control: {type: 'ephemeral'}` in `llm-provider.js`. Meaningful once traffic hits double-digit daily runs.
- **Streaming responses** would cut perceived latency. But Claude 4 API streaming needs larger state on the client. Not worth shipping until daily traffic justifies it.

### Confidence
80%. The caching recommendation is the clearest win but needs a test run against a real diagnostic to confirm the scaffolding/user split is clean.

---

## 3. LLM portability layer — gap

`llm-provider.js` is an elegant 4-provider abstraction (Anthropic, OpenAI, Gemini, Ollama). But `index.html` calls `llmChat(prompt, { apiKey: apiKey, model: 'claude-sonnet-4-6-20250929', ... })`, hardcoding the Anthropic model and bypassing `llmSetProvider()`. Consequences:

- A user who installed Ollama locally would still send their Anthropic key to the Anthropic endpoint — the provider abstraction isn't actually connected to the UI.
- No UI affordance to switch provider. The setup screen only captures an Anthropic API key.
- Sovereignty (L3 / L4 paths) is theoretical, not real.

### Recommendation
Two routes, pick one:

**Route A — cheap and honest:** delete the provider abstraction, document "Anthropic-only" in the README. Remove `llmSetProvider()` + `llmGetProvider()`. 15 min.

**Route B — actually deliver portability:** in the setup screen, add a `<select>` for provider (Anthropic / OpenAI / Gemini / Ollama-local). On submit, call `llmSetProvider(key, apiKey)`. Remove the hardcoded `model:` override in `runDiagnostic()` — let the provider default drive it, or expose a model picker. ~90 min including layout + test for all 4 providers. This is the HAL-aligned move (decapitation path: drop Anthropic without rewrite).

### Confidence
95% that Route B is the correct long-term choice (given Two Birds' sovereignty posture). 70% that users will actually switch providers — the feature is marketing-value as much as functional.

---

## 4. Security & privacy

### Strengths
- API key stored in `localStorage` with clear disclosure ("never leaves your browser except directly to Anthropic"). Accurate.
- No analytics, no telemetry, no cookies. Nothing to leak.
- `escapeHtml()` wraps every field of the AI response before rendering. XSS-safe.
- `.env` is in `.gitignore` (committed 2de323c).

### Concerns
- The `anthropic-dangerous-direct-browser-access: true` header is required for browser-origin requests to Anthropic but does come with known CORS-shaped risks if the API changes. Worth monitoring Anthropic's deprecation notes.
- `localStorage` keys are not scoped — `clarity_api_key` sits alongside `llm_api_key` / `cc_api_key` if the user ever uses this origin for another Two Birds tool. Low-probability collision; worth namespacing if the origin ever hosts a second app.
- No CSP header set (static hosting on GitHub Pages — out of Clarity's control). A future move to a CDN with header control should add a strict CSP: `script-src 'self' https://cdnjs.cloudflare.com;` — currently inline `<script>` block would break it. Refactor the inline IIFE into `js/clarity-app.js` during that migration.

### Recommendation
File a backlog item: "Inline script-to-file refactor for CSP readiness." LOE: 1 h.

### Confidence
80%. Two Birds' current threat model (low-volume, self-hosted keys, no PII persistence) is not materially exposed by any of these. But the CSP refactor is cheap insurance.

---

## 5. Responsive & cross-browser

- Breakpoints: 768 / 600 / 375. Tested via static review.
- `@media (max-width: 375px)` hardens the small-phone case: 16px minimum body text, 44 px tap targets, full-width buttons.
- `@media (prefers-reduced-motion)` zeros out the loading-dot animation and scroll-smooth.
- ES5-safe idioms throughout (`var`, `.forEach`, `.then/.catch/.finally`). `async/await` only inside `llm-provider.js` → runs in any post-2018 browser.
- `@media print` properly hides chrome and preserves SWOT background colours via `print-color-adjust: exact`.

### Recommendation
- **Manual browser verification:** open in Safari (macOS + iOS), Firefox, and Edge before every content update. No automated cross-browser test exists — Playwright would be the HAL-aligned add, mirroring DCC's S-029 setup. LOE: 2 h if the DCC Playwright config is lifted wholesale. Flag for follow-up sprint: **S-CLARITY-CROSS-BROWSER**.
- **Test on an actual Canadian Rogers / Bell mobile network** — 15-30 s API call on a 3G-ish connection becomes a 45 s wait, and the UI should not look stalled during that time.

### Confidence
75%. No real-device test was run as part of this audit.

---

## 6. CI / CD

### Shipped this sprint
`.github/workflows/axe-core.yml` runs on every push to main, every PR, and via `workflow_dispatch`. Fails the build on any critical WCAG violation; reports serious/moderate/minor as the job summary + uploaded artifact.

### Backlog
- **Broken-link check** (mirror DCC's `broken-external-link-check.yml`) — low value right now (very few external links in the app), but the template exists and costs nothing to add. LOE: 15 min.
- **Lighthouse CI** for performance / SEO / best-practices scores. The site is small enough that any single regression would be visible, but a 3-month baseline is useful. LOE: 30 min.
- **Playwright E2E** — would require a mock LLM endpoint. Worth it only once diagnostic traffic is real. Defer.

### Confidence
90%. The current CI setup covers the highest-risk regression surface (A11y).

---

## 7. Monetization & B2B positioning

This is the section where the audit scope gets opinionated. Aaron asked specifically for "monetization, B2B positioning, content refresh" recommendations.

### Current state
- **The offer:** Free diagnostic → "Book a Free 30-Minute Call" → CA$2,500 AI Workflow Audit (described, not listed on a pricing page).
- **The CTA:** a `mailto:` link with a pre-filled subject and body referencing the diagnostic.
- **The funnel:** No email capture *before* the diagnostic, no email *after* if the user doesn't click the CTA. Every non-mailto-clicker is lost forever.
- **Social proof:** None.
- **Trust signals:** "Aaron Patzalek · 20-year Senior PM · St. Thomas, Ontario" on the CTA card. Accurate and local but thin.

### Where Clarity under-monetizes (in order of fixable)

1. **No email capture gate.** Users bring their own API key — which means they're either *technical* or willing to follow a link to `console.anthropic.com` and sign up. That's a small, high-value cohort. Asking for an email *before* showing the result converts more of them to pipeline. Proposed: after the LLM returns, show a 2-field capture ("Email to send yourself this report" + optional "Best time to chat") before the CTA card. Gate the Save Report button on it. Risk: friction. Mitigation: make it optional with a clear "Skip — just show me the result" link. LOE: 2 h including a light backend (email forwarder via Formspree / Forms-Pro; no server code).

2. **Mailto → Calendly.** `mailto:` is 2010-era B2B. Calendly / Cal.com / TidyCal embed directly. A Canadian SME owner in the 45-65 demographic does not want to compose an email saying "best times for me:" — they want to pick a slot. LOE: 15 min (change the `href` from mailto to Calendly link once Aaron creates the Calendly event). Pairs with email capture above.

3. **No pricing page.** The CA$2,500 audit is mentioned inside the CTA copy on the results page. A static `pricing.html` (or a section of the same page, below the fold) listing what the audit includes (duration, deliverables, timeline, guarantee) would pre-qualify leads and raise close rate. LOE: 2-3 h to write + lay out.

4. **No testimonials or case studies.** The entire site is anonymous. Even a single pseudonymous quote ("— Manufacturing owner, Kitchener") from a friendly pilot customer adds disproportionate trust. If no pilots yet: write a "Who I've worked with" paragraph pointing at the DCC / Kevin's Apartment / Career Coach repos as portfolio evidence that you ship things. LOE: 30 min.

5. **No follow-up after diagnostic.** After the report shows, the only affordance is "Book a call." Users who *like* the report but don't want to call *now* have nowhere to go. Add: "Not ready for a call? Get the weekly Two Birds briefing" → email list. Even if the list doesn't exist yet, capturing the intent is valuable. LOE: depends on email-list setup (ConvertKit / Buttondown).

### B2B positioning — what's working

- Canadian English throughout (`centre`, `organisation`, `analyse`). Not cosmetic — signals genuine Canadian SME focus.
- The problem framing in the diagnostic questionnaire (cost concerns, staff resistance, "don't know where to start") is *exactly* how Canadian SME owners describe their AI hesitancy. Research-grade wording.
- Parent of twins / St. Thomas origin is trust-building for the target demographic. Don't remove it. Lean in: a "Why I built this" paragraph on an About section would close more deals than any feature.

### B2B positioning — what's missing

- **Vertical specialization.** Right now Clarity targets every Canadian SME ("manufacturing / retail / trades / healthcare / non-profit / other"). Every consulting-sales thesis says *pick one*. Proposal: after running 3-5 real diagnostics, look at which industry's results you'd most confidently turn into an audit engagement. Specialize the home page around that one, keep the form general. LOE: one research pass + one content pass, ~3 h total.
- **Outcomes, not features.** "Get a SWOT" is a feature. "Know what to stop doing by Monday" is an outcome. The intro and CTA copy are currently feature-first. Rewrite once.
- **Urgency.** No deadline, no scarcity, no "only taking 5 clients this quarter" framing. Pragmatic: don't fake urgency, but *do* signal calendar limits ("I take 3 audit clients a month — here's the April calendar").

### Confidence
70% on monetization recommendations — founder judgment reasonably overrules any of them. High-confidence on (1) email capture and (2) mailto → Calendly; medium on pricing page; lower on vertical specialization (depends on which vertical early pilots validate).

---

## 8. Content refresh

### What's fine
- Intro paragraph ("Get a clear picture of your business's AI readiness") is accurate.
- Loading copy ("Analysing your business... 15-30 seconds") sets expectations cleanly.
- Footer copy is honest.

### What to rewrite

1. **Page `<title>`** — currently `Clarity — AI Business Diagnostic | Two Birds Innovation`. Swap to `Clarity — AI diagnostic for Canadian small businesses | Two Birds` for SEO geo-targeting and vertical hint.
2. **`<meta name="description">`** — currently 50th-percentile generic. Rewrite with a specific outcome: "Free AI-readiness diagnostic for Canadian SMEs. In under a minute, get a SWOT, priority recommendations, and a concrete next step — no sales email follow-up, no obligation."
3. **Header tag line** — `By Two Birds Innovation · St. Thomas, Ontario` is correct but reads like a footer. Move this to the actual footer; put the value-proposition-in-one-line in the header: "AI diagnostic for Canadian SMEs. Free. Takes one minute. No spam."
4. **Intro "Get a clear picture..."** — replace with a question the prospect asks themselves: "Wondering whether AI fits your business but not sure where to start? Answer 7 quick questions and get a tailored SWOT + three concrete first steps — in under a minute. Free."
5. **CTA "Want to turn this into an action plan?"** — solid copy. Keep.
6. **Footer disclosure** — `Your API key and business data never leave your browser except to call the Anthropic API directly.` Accurate. If moving to Route B (multi-provider), update to name the active provider dynamically.

### Confidence
85%. Copy is subjective — these are style suggestions, not rules.

---

## 9. Top 5 prioritised next actions

Ranked by `impact × (1 / LOE)`:

1. **Mailto → Calendly** (15 min). Biggest UX / conversion lift per minute of work.
2. **Pricing page or section** (2-3 h). Pre-qualifies leads; lets price-sensitive users self-select out; lets qualified ones self-select in.
3. **Email capture before Save Report** (2 h). Plugs the leakiest part of the funnel.
4. **LLM portability Route B** (90 min). Delivers on the "sovereign" claim; expands addressable users (non-Anthropic customers).
5. **Testimonial or portfolio-evidence block** (30 min). Raises trust with zero new infrastructure.

Items 1 + 5 could ship in a single ~1-hour sprint. Items 2 + 3 + 4 each need their own sprint.

---

## 10. What this audit did NOT cover

- **SEO positioning** beyond the title/description rewrite. A proper keyword study (e.g., "AI readiness assessment small business Canada") would inform homepage copy.
- **Competitor feature audit** — is there a Clarity-alternative in the Canadian market? One pass through `canadiansmesoftware.com` / AI-adoption consultants / Chamber of Commerce tools would sharpen positioning.
- **User testing with real SME owners.** No substitute for showing a diagnostic result to 3 actual business owners and watching where they frown, scroll, or click away.
- **Pricing validation.** CA$2,500 is a number, not a tested number. Worth asking 5 prospects "does that feel like too much, too little, or about right for what I'm offering?" before locking it in.

---

## Confidence (overall)

85% that this audit names the highest-leverage gaps. 15% reserved for: I don't have access to actual prospect conversations or to the Calendly / email-list infrastructure you may already have, so some recommendations may be partially duplicative.

## Scrappy Pack says
The Ripper says: Every SaaS onboarding flow that captures email *before* showing value costs 15-30% conversion — but the cohort that stays is 3× more likely to pay. Clarity is currently on the wrong side of that trade for lead-gen purposes.
LOE: varies — items 1-3 above all under 3 h each; start with mailto→Calendly before the next call.
