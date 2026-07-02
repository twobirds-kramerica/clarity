# "Why I built this" — revised draft (twins + St. Thomas origin)

**Status:** DRAFT — needs Aaron review before it goes live (personal/family story on a public product).
**For:** `clarity/index.html` #why-built section (replaces current copy, lines ~599-606).
**Sprint:** S-CLARITY-WHY-BUILT (Clarity AUDIT). Drafted 2026-07-02.
**Why revised:** current copy is career-framed only; the audit asked for the human, relatable origin (parent of twins, St. Thomas) to build trust with the SME demographic.

---

## Proposed copy

**Why I built this**

I spent 20+ years as a product manager at TELUS, Staples, and Start.ca. The whole time, I watched the gap between big companies and small businesses get wider with every new wave of technology.

AI is the same story, only faster. Large companies have dedicated teams, outside consultants, and budgets. Small businesses in Southwestern Ontario have YouTube videos and vendor pitches that turn confusion into expense.

I live in St. Thomas. My wife and I are raising twin daughters here. I know what it is to want to do right by the people who count on you while the ground keeps shifting under your feet. The business owners I meet are carrying the same load: payroll, family, long days, and now a technology everyone says they need but nobody explains plainly.

So I built Clarity for them, and for the version of me who sat in enterprise meetings wishing small businesses had the same clear thinking on tap. It gives you the strategic read an enterprise product manager would apply internally, without an IT department, a consultant on retainer, or a subscription that auto-renews every month.

It runs on a secure proxy I built. Your business data is used only to generate your diagnostic. It is never stored or shared. No account. No API key. No subscription. No lock-in. Just a clear picture of where you stand with AI and what to do next.

Aaron Patzalek
Founder, Two Birds Innovation. St. Thomas, Ontario.
20-year Senior PM · twobirds-innovation.ca

---

## Notes for implementation
- New third paragraph is the added personal/origin content; paragraphs 1, 2, 4, 5 lightly tightened from the current live copy.
- Keep the existing `.why-built-sig` markup; the signature line is unchanged in substance.
- The current live copy uses em dashes (`&mdash;`); this draft removes them per the voice-check rule (Aaron's content bans em dashes). If implementing, use commas/periods as written here, not `&mdash;`.
- No design/structure change — same section, same tokens. Copy-only swap.

✓ voice check: [heading + 5 body paragraphs + signature] | 0 caught | 0 fixed (no banned words, no em dashes, no participial/filler openers)
