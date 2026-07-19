# note-biz Operating Rules

## Mission

Build a repeatable side business around paid note articles, Amazon Associates, and approved A8.net programs, targeting JPY 10,000 in monthly revenue within three months.

The operator should only need to trigger a command, review and manually publish an article on note, and report KPI values.

## Editorial Position

- Genre: AI utilization for sales and business automation.
- First-hand assets: practical CTO experience with GAS, scraping, Claude, Gemini, sales-list automation, and operational improvement.
- Audience: sales teams, DX staff at small and medium-sized companies, and non-engineer process-improvement owners.
- Explain technical terms in plain language.
- Use polite Japanese (`です・ます`), avoid hype, and ground claims in real experience.
- Free section: empathize with the problem and preview the conclusion.
- Paid section: provide reproducible steps, templates, and code.
- Initial price: JPY 300-500. Consider increases or a magazine only after results accumulate.
- Use one of these categories: `AI仕事術`, `AIキャリア`, `AI投資メモ`.

## Mandatory Compliance

- Publishing to note is manual copy and paste only. Never use an unofficial note API or browser automation to publish.
- Only manually registered, partnership-approved Amazon Associates or A8.net links may appear inside note articles. Never invent an affiliate URL or include an unapproved program.
- Add `※本記事には広告・アフィリエイトリンクが含まれます。` near the beginning whenever an article contains affiliate content.
- Place a CTA only where it naturally helps solve the reader's problem. Do not force links into an article.
- For investment content, do not recommend individual securities or promise returns.
- For schools and coaching services, explain material cautions as well as benefits.
- Do not reproduce other people's content or overuse quotations.
- Do not invent operator experience, results, customer names, numbers, or quotes. Mark missing first-hand details as review items.

## Writing Standards

- Write naturally in the operator's first person.
- Do not use generic AI phrases such as `いかがでしたか`.
- Separate facts, observations, and hypotheses.
- Cite research sources with URL and access date.
- Keep code safe, minimal, and runnable; explain where credentials or personal data must not be embedded.
- Before finalizing, check compliance, unsupported claims, broken structure, and whether a non-engineer can follow the steps.

## Repository Workflow

- Research goes to `research/YYYY-MM-DD-<slug>.md`.
- Drafts go to `drafts/YYYY-MM-DD-<slug>.md`.
- Published records go to `published/` only after the operator has manually published on note.
- KPI data lives in `data/kpi.csv`; preserve its header and update rows by article slug.
- Affiliate programs live in `data/affiliate-links.csv`. Keep `affiliate_url` empty until partnership approval, and never store A8 credentials or personal data.
- Never modify `../ai-company` from this repository.
- Vault integration is file-based and optional. Phase 1 must work without it.
