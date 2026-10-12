# Investment Skills

This directory decomposes the `Investment Thinking Model v1`
(`ai-secretary/docs/INVESTMENT_THINKING_MODEL.md`) into 16 Skills — one per research-sequence
step. It is documentation and governance, not a second runtime.

## What a Skill is here

A Skill is a **playbook**: a scoped description of how an existing part of
`ai-secretary/app/lib/investing/` (and the shared `app/lib/fund/` provider/market-data layer) is
used for one step of the thinking model, what evidence rules apply, and what the Skill is not
allowed to do.

A Skill is **not**:

- a new, independent agent;
- a new Provider;
- a new Research Store, Evidence Store, or Decision Store;
- an execution path to a broker, an order, or a funds transfer.

If implementing a Skill would require any of the above, that is a sign the Skill is scoped wrong
— go back to the canonical infrastructure in `app/lib/investing/` and extend it there, then point
the Skill's playbook at the extension.

## Relationship to the code-level Skill Registry

This directory is the human-readable playbook layer. Each Skill here also has a matching, minimal
entry in the code-level registry at `ai-secretary/app/lib/skills/registry.ts`
(`SKILL_REGISTRY`), using the existing `SkillDefinition` type
(`ai-secretary/app/lib/skills/types.ts`). All 16 investing entries are registered with
`status: "planned"` — none has a `run()` implementation in
`ai-secretary/app/lib/skills/implementationRegistry.ts`. Implementing one means adding a thin
function that calls existing `app/lib/investing/` code, never a new backend.

`allowedSecretaries` for every investing Skill is `["personal-fund"]`, matching the existing
Fund Department / Investment Department secretary (see `docs/11_INVESTMENT_DEPT_PLACEMENT.md` and
`ai-secretary/app/lib/config/departments.ts`).

## Schema

See `SKILL_SCHEMA.md` for the required frontmatter and sections every `SKILL.md` in this
directory must have.

## The 16 Skills

Grouped by the department that owns them (see
`ai-secretary/docs/INVESTMENT_DEPARTMENT_STRUCTURE.md`):

**① Market & Theme Research**
- [`market-hypothesis`](./market-hypothesis/SKILL.md)
- [`long-term-demand`](./long-term-demand/SKILL.md)
- [`market-structure`](./market-structure/SKILL.md)
- [`picks-and-shovels`](./picks-and-shovels/SKILL.md)
- [`bottleneck-discovery`](./bottleneck-discovery/SKILL.md)
- [`causal-distance`](./causal-distance/SKILL.md)

**② Company Research**
- [`candidate-company-discovery`](./candidate-company-discovery/SKILL.md)
- [`fundamental-research`](./fundamental-research/SKILL.md)
- [`valuation-research`](./valuation-research/SKILL.md)
- [`risk-research`](./risk-research/SKILL.md)

**③ Opportunity Intelligence**
- [`short-term-analysis`](./short-term-analysis/SKILL.md)
- [`mid-term-analysis`](./mid-term-analysis/SKILL.md)
- [`long-term-analysis`](./long-term-analysis/SKILL.md)

**⑥ Decision & Learning**
- [`opportunity-decision`](./opportunity-decision/SKILL.md)
- [`performance-review`](./performance-review/SKILL.md)
- [`investment-learning`](./investment-learning/SKILL.md)

Department ④ (Portfolio Intelligence), ⑤ (Opportunity Pipeline) and ⑦ (Provider Health) do not
get dedicated Skills in PR-A; they are reused directly through
`app/lib/investing/analysis.ts`/`portfolio.ts`/`watchlist.ts` and the provider layer. Skills for
them may be added in PR-D if a repeated, documentable playbook emerges there.

## Human Gate (every Skill)

Every Skill in this directory ends at research, comparison, scoring, or decision-*support*. None
of them may conclude in an executed trade, an automatic position change, or a funds transfer.
Final GO/WAIT/PASS, position size, order placement, broker action, and money transfer are
`HUMAN_ONLY`, matching `app/lib/company/execution/actionTypes.ts` (`INVESTMENT_TRADE` = `R4`) and
`app/lib/fund/engine.ts` (`executionAuthority: "HUMAN_ONLY"`). See each `SKILL.md`'s "Human Gate"
section for the specific decision it feeds, never executes.

## No Auto Trade

Repeated here because it is the one rule every Skill file restates: no Skill in this directory may
be wired to, or recommend adding, a broker executor, auto-buy, auto-sell, auto position sizing, or
auto funds transfer.
