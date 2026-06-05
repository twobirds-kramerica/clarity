# CLAUDE.md — Clarity

## Project Identity
- Owner: Aaron Patzalek · Two Birds Innovation
- Product: Clarity — free AI readiness diagnostic for Canadian SMEs
- Audience: Canadian SME owners aged 35–60; skeptical of vendor pitches; time-poor; reading on phones between jobs
- Stack: Static HTML/CSS/JavaScript only. No frameworks, no backend, no build tools.
- Deployment: GitHub Pages (`twobirds-kramerica.github.io/clarity`)
- HAL Stack global context: `C:\twobirds\two-birds-portfolio\CLAUDE.md`

## Hard Constraints (Never Violate)
- STATIC ONLY: No Node.js, no npm, no build steps, no backend.
- CREAM BACKGROUND CONTRAST: The Clarity palette uses a warm cream background (`#ede8df` or similar). KNOWN FAILURE: `#888888` on `#ede8df` = 2.9:1 contrast ratio — this fails WCAG AA. Before shipping any sprint touching text colour: verify contrast ≥ 4.5:1 for body text. Use a contrast checker. Do not ship a sprint with known contrast failures.
- CANADIAN PLAINSPEAK: All UI text is written for a plumber in St. Thomas, not a McKinsey analyst. If a word could be shorter or plainer, use the shorter word. No buzzwords, no "leverage", no "synergies", no "ecosystem".
- BYOK MODEL: LLM calls use the user's own API key. Never proxy user API keys through a Two Birds server. See ADR-0005.
- FONT: Current font is Roboto (flagged as overused — replacement candidate is Geist or Outfit). Do not swap fonts without Aaron's explicit approval and a design brief. Any font change must use self-hosted files (SIL OFL), not Google Fonts CDN.

## Design Principles (from PRODUCT.md)
1. **The result is the product.** The diagnostic output page — the SWOT, the benchmark, the first step — is what the user came for. It must be the best-designed element on the site.
2. **Earned authority.** Lead with the diagnostic; credentials come after the tool demonstrates value.
3. **Canadian plainspeak.** Written for St. Thomas, not Bay Street.
4. **Single action per screen.** One question at a time. No multi-field forms.
5. **The report is portable.** The downloaded output must look professional enough to share with a business partner or bring to a bank meeting.

## Anti-references (absolute bans — do not ship anything resembling)
- Hero metrics: big number + small label + gradient accent — absolute ban per /impeccable
- Generic SaaS cream-and-teal AI tool aesthetic (Clarity must feel like a senior consultant, not a $29/month startup)
- Overly dark "tech dashboard" feel — wrong audience
- Quiz app / Buzzfeed personality test look
- Corporate enterprise sales pages (Salesforce, IBM) — too intimidating for SMEs

## Known Audit Issues (June 4, 2026 — 13/20 score)
Outstanding items — fix before shipping any sprint touching the relevant area:
- **P0 Side-stripe issues (x3):** Three components have a side-stripe accent with contrast or layout failures. Identify and fix before any CSS sprint on those components.
- **P1 SWOT card colours:** SWOT quadrant card colours fail contrast or are inconsistent. Fix before any results-page sprint.
- **P1 Em dashes:** Body copy uses em dashes in a way that fails screen reader pause behaviour. Replace with `&mdash;` or restructure the sentence before any copy sprint.
- **P1 aria-live:** Dynamic content updates (diagnostic results rendering) are not announced to screen readers. Add `aria-live="polite"` to result containers before any results-page sprint.

## Accessibility Standards
- WCAG 2.1 AA — especially critical on cream background. Minimum 4.5:1 body text contrast.
- Mobile-first: business owners check results on phones between jobs. Test on 375px viewport.
- No autoplay, no animations that distract from reading results.
- Dark mode: test on Android Chrome before any visual sprint is marked done. File Aaron action P1 if this test cannot be done locally.

## Commit Convention
- `feat(clarity):` new feature
- `fix(clarity):` bug fix
- `chore(clarity):` maintenance, config, docs

## ADR Rule
Any sprint introducing a significant architectural change (Cloudflare Worker proxy, new data layer, new LLM provider integration) must file an ADR in `C:\twobirds\two-birds-portfolio\hal-stack\architecture\decisions\` before pushing. The Cloudflare Worker sprint (S-CLARITY-WORKER) is pre-approved in principle — file ADR when executing.
