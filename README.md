# Clarity — AI Business Diagnostic for SMEs

Free AI-readiness diagnostic tool for small and medium-sized Canadian businesses.

## What this repo is

Static single-page tool where an SME owner answers a short set of questions and receives an AI-readiness assessment (SWOT, quick wins, recommended next steps). Paired with a CA$2,500 optional consulting upgrade.

Part of the Two Birds Innovation portfolio.

## How to run it

Vanilla HTML/CSS/JS — no build step, no npm.

- Clone the repo
- Open `index.html` in a browser
- Live URL: `https://twobirds-kramerica.github.io/clarity/`

## Stack

- Static HTML/CSS/JS per Two Birds no-npm standing rule
- LLM provider picker (Anthropic / OpenAI / Gemini / Ollama) via `js/llm-provider.js` — bring-your-own-key, runs client-side, no server storage
- Inline script extracted to `js/clarity.js` for CSP readiness (S-KEVIN-CSP-READY pattern)
- axe-core every-push a11y CI
- Weekly broken-external-link check

## Related repos

See `two-birds-portfolio` for cross-cutting governance + HAL Stack infrastructure. `career-coach` (sibling tool, same portability pattern).

## Model lock note

Current Claude model family is 4.X (Opus 4.7, Sonnet 4.6, Haiku 4.5). When editing / running sessions on this repo, use `claude-sonnet-4-6` not any earlier Sonnet-4 variant.

## AUDIT

`AUDIT.md` carries the HAL Stack rigor audit with a PROGRESS UPDATE header mapping closed Top-5 items to their commits. Two items still open (pricing page, email capture) blocked on product decisions; Calendly mailto blocked on Aaron providing a scheduling URL.

## License

All content owned by Aaron Patzalek / Two Birds Innovation unless noted otherwise in a LICENSE file.
