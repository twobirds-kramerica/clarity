# Product: Clarity — Business Operations Check-Up

**Status:** Live  
**URL:** https://twobirds-kramerica.github.io/clarity/  
**Repo:** `C:\twobirds\clarity\` (twobirds-kramerica/clarity)  
**Owner:** Aaron Patzalek — Two Birds Innovation

**Positioning (revised 2026-07-10, see `hal-stack/product-intelligence/clarity-v3-positioning-brief-2026-07-10.md` and `hal-stack/personas/product-personas/clarity-personas.md`):** operations expertise, not an AI tool. AI is part of the mechanism, never the pitch. Never position Aaron as an AI practitioner or Clarity as an AI diagnostic in any user-facing copy.

## Users

Small and medium business owners in Southwestern Ontario, aged 35–60 (personas: Mike the trades shop owner, Dana the health practice owner, Paul the mid-size operations GM — see personas file above). Typically a trades business, professional services firm, healthcare admin, or retail operator. They are tired of hearing about AI, not curious about it. They're skeptical of vendor pitches. They don't have an internal IT person. They're time-poor and decision-fatigued. They're arriving from a cold email, a LinkedIn referral, or word of mouth from a peer.

Primary task: answer six questions about how the business actually runs, receive a personalised SWOT + effort/payback-rated recommendations + a peer benchmark, and decide whether to book a call with Aaron.

## Product Purpose

Free operations check-up for Canadian SMEs. Not a lead magnet, a genuine diagnostic that produces useful output even if the user never books a call. Secondary purpose: qualify leads before they reach Aaron so calls start with context.

Success looks like: a business owner runs the diagnostic, understands where they stand relative to their industry, and either books a call or shares the tool with a peer.

## Brand Personality

Honest advisor. Expert without jargon. Clarity over complexity.

Tone: direct, plain Canadian English. No buzzwords. No "leverage synergies." The brand personality is a senior consultant who gives you the real answer, not the comfortable one.  
Voice: confident but not arrogant. "Here's what we found" not "Congratulations on your journey."

## Anti-references

- Generic SaaS cream-and-teal AI tools (the entire $29/month AI startup aesthetic)
- Overly dark "tech dashboard" feel (black background with neon — feels like a developer tool, wrong audience)
- Anything that looks like a quiz app or Buzzfeed personality test
- Corporate enterprise sales pages (Salesforce, IBM) — too intimidating for a SME
- The "hero metric" layout: big number, small label, gradient accent — absolute ban per impeccable

## Design Principles

1. **The result is the product.** The diagnostic output page — the SWOT, the benchmark comparison, the first step — is what the user came for. It must be the best-designed element on the site.
2. **Earned authority.** Credentials come after the tool demonstrates value. Lead with the diagnostic, not with Aaron's resume.
3. **Canadian plainspeak.** Every label, button, and result description is written for a plumber in St. Thomas, not a McKinsey analyst. If a word could be shorter or plainer, it should be.
4. **Single action per screen.** The diagnostic is a conversation, not a form. One question at a time.
5. **The report is portable.** The output should look professional enough to share with a business partner or bring to a bank meeting.

## Design Tokens (active in code)

- `--olive: #5C6B4F` · `--olive-dark: #4A5640` · `--olive-light: #E8EDE4`
- `--charcoal: #2C2C2C` · `--charcoal-light: #4A4A4A`
- `--cream: #F5F3EE` · `--white: #FAFAF8`
- `--accent: #8B7355` · `--accent-light: #C4A882`
- Font: **Atkinson Hyperlegible** (SIL OFL — self-hosted, accessibility-first)
- Max width: 760px · Border radius: 10px

## Architecture

- Static HTML/CSS/JS only — no build step, no npm, no framework
- LLM: built-in secure proxy OR BYO API key (Claude, GPT-4o, Gemini, Ollama)
- No server-side storage. Business data never leaves the browser except to call the LLM.
- GitHub Pages hosting (twobirds-kramerica org)

## Report Outputs (current)

1. SWOT Analysis (4-quadrant grid)
2. Priority Recommendations (numbered, effort/impact badges)
3. Quick Wins (3 immediate actions)
4. Next Step (concrete action item)
5. PIPEDA privacy note (conditional — personal data only)
6. Canadian Economic Context (Bank of Canada Valet API)
7. Effort vs. Payback Matrix (2x2 CSS-grid plot of the priority recommendations)
8. Competitive Landscape Snapshot (synthesised from the user's own answers; labelled, no invented statistics)
9. Market Trends Summary (industry-specific, qualitative, labelled as synthesised; live figures stay in the Bank of Canada section)

## Lead-Gen Flow

Report → CTA card → "Book my free 20-minute AI review" → Calendly `twobirdsinnovation/30min`  
OR email capture → Formspree (configure `FORMSPREE_ENDPOINT` in `js/clarity.js`)

## Accessibility & Inclusion

- WCAG 2.1 AA (axe-core CI gate — `.github/workflows/axe-core.yml`)
- Mobile-first — business owners are often reading on phones between jobs
- No autoplay, no animations that distract from reading results
- Reduced-motion media query on all CSS animations
