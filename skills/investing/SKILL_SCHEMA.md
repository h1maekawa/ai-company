# Investment Skill — Common Schema

Every `skills/investing/<skill-id>/SKILL.md` must follow this schema so the 16 Skills stay
comparable and auditable as a set.

## Frontmatter

```yaml
---
id: <kebab-case, matches the directory name and the SKILL_REGISTRY id in ai-secretary/app/lib/skills/registry.ts>
name: <short display name>
department: <one of the 7 logical departments from INVESTMENT_DEPARTMENT_STRUCTURE.md>
thinkingModelStep: <the step in the research sequence this Skill performs>
horizon: <SHORT | MID | LONG | ALL — ALL if the step is horizon-independent>
status: planned   # must match the status field of the same id in SKILL_REGISTRY
---
```

## Required sections, in this order

1. **Purpose** — one paragraph: what research question this Skill answers.
2. **Reuses** — the exact existing files/functions this Skill calls into. Must name real paths
   under `app/lib/investing/`, `app/lib/fund/`, or `app/lib/company/`. If nothing exists yet for
   part of the Skill, say so explicitly rather than inventing a new store.
3. **Inputs** — what evidence/artifacts the Skill reads (e.g. `IntelligenceToday`,
   `InvestmentCandidate[]`, `Portfolio`, `FundamentalSnapshot`). Name the existing type from
   `app/lib/investing/intelligence/types.ts` or `app/lib/investing/types.ts` where one exists.
4. **Output** — the artifact or claim this Skill produces, and its claim kind
   (`FACT` / `INTERPRETATION` / `HYPOTHESIS` / `UNKNOWN`) where that applies.
5. **Evidence rules** — what must never be guessed, and what happens when a required input is
   missing (must default to `UNKNOWN`/`null`, never a synthetic value).
6. **Human Gate** — exactly which human decision this Skill's output feeds, and a statement that
   it cannot itself execute that decision.
7. **Prohibited** — an explicit list drawn from the department-wide prohibitions: no new
   Provider, no new Research/Evidence/Decision Store, no broker execution, no automatic weight
   change.
8. **Status** — one line: `planned` (no `run()` implementation yet) or `implemented` (and, if
   implemented, the function name in `app/lib/skills/implementationRegistry.ts`).

## What is explicitly out of scope for a `SKILL.md`

- Introducing a new file under `app/lib/investing/intelligence/providers/` for this Skill alone.
- Introducing a new persisted store (file, table, or otherwise) for this Skill alone.
- Describing or implying an automatic trade path.
- Silently changing a scoring weight described in `INVESTMENT_THINKING_MODEL.md`.
