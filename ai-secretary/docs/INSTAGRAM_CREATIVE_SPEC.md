# Instagram CreativeSpec

## Status and ownership

`InstagramCreativeSpec` is the typed, Instagram-specific decision artifact between canonical research input and later creative production. The Creator / SNS domain owns it. Research evidence remains referenced by ID; this artifact does not copy research into a second store.

The B2 scope is contract-only: types, pure validation, structural templates, and a capability fixture. There is no persistence, renderer, provider connection, upload, publish action, metric sync, or learning mutation.

Lifecycle:

```text
canonical research/source refs
  → idea/draft CreativeSpec
  → validation
  → human review
  → approved CreativeSpec
  → B3 carousel generation (planned)
```

An approved CreativeSpec is not publish authorization. Publication remains a later provider and Action Gateway concern.

## Contract

The canonical type is `app/lib/content/instagram/creativeSpec.ts`. It represents:

- platform, version, status, format, Brand Policy pillar, purpose, audience, topic, angle, and hook;
- stable product references, verification state, evidence-backed claims, and real product image references;
- independently addressable slides with order, role, copy, product/asset references, layout intent, visual emphasis, and CTA;
- reference-only assets, visual direction, caption, commercial relation, disclosure state, safety state, source lineage, and review state.

Missing or unavailable product facts remain explicit `unknown` / `unavailable`, an absent optional reference, or an empty claim collection. They are never converted to `false`, `0`, or invented copy.

## Brand and visual direction

Pillar validation reuses `platformBrandPolicy("instagram")` as the Brand SSOT. Supported pillars are Fashion, Sneakers, Fragrance, Lifestyle, Coffee, Interior, Gadget, and Work Style. Investment is not allowed as the primary Instagram topic.

The visual contract can express White, Ivory, Gray, Black, and Wood palettes; clean/editorial/whitespace/minimal/men's-select-media treatments; thin-line illustration; and optional lifestyle motifs. Cat and coffee motifs are available but never mandatory.

## Product image safety

The invariant is:

```text
actual product representation = actual, non-generated product asset
```

Generated assets may be backgrounds, illustrations, decoration, layout elements, characters, cats, coffee, lifestyle motifs, or abstract texture. A generated asset marked as real product representation is a blocking validation error. Every represented real product must point to at least one non-generated asset explicitly marked as a real product representation.

CreativeSpec contains only asset IDs, URLs, or storage references. Binary and Base64 data do not belong in the artifact. Unknown usage rights produce a Human Review warning; they are not silently treated as authorized.

## Product facts and personal experience

Price, effect, scent, material, feature, review, and experience claims require traceable source references and `verified` state. Product source URLs are mandatory. The validator blocks unsourced or unverified factual product claims and unverified first-person experience. It does not auto-repair either condition.

The Gucci Gorgeous Flora Gardenia fixture demonstrates that a fragrance carousel can be represented without hardcoding a current price or asserting unverified product details. It is a contract fixture, not current catalog truth.

## Slides and templates

Carousel slides are separate typed objects. Roles include cover, hook, context, product, comparison, reason, how-to-choose, recommendation, summary, CTA, and disclosure. Empty carousels, duplicate order values, and broken product or asset references are blocking errors.

Initial structural templates are Product Hero, 3 Picks, 5 Picks, Comparison, Ranking, How to Choose, Personal Pick, and Lifestyle. Templates define only slide-role sequences. Copy generation, asset selection, layout composition, image rendering, and preview belong to B3.

The cover contract stores a hook separate from the product name. Any sensory or product-specific cover statement is still subject to factual-claim evidence rules.

## Commercial relation and disclosure

Relations are `none`, `affiliate`, `pr`, `gifted`, `paid-partnership`, and `own-product`. Affiliate, PR, gifted, and paid-partnership content requires an explicit disclosure. Affiliate URLs are references to registered links, not AI-generated URLs.

The contract reuses the existing default Monetization Policy disclosure wording through `defaultInstagramDisclosure()`. CreativeSpec records the relation, requirement, policy reference, and caption disclosure; it does not own a second disclosure engine.

## Human approval boundary

`createInstagramCreativeDraft()` always returns `status: "draft"` with pending review. A spec marked approved without recorded human authority, reviewer identity, and review timestamp fails validation. AI generation therefore cannot create a valid approved artifact.

This is a representation boundary, not a new approval service. A later execution path must resolve human identity from trusted server-side authority and must not trust arbitrary client-provided approval fields.

## Validation dispositions

- `blocked`: at least one safety, reference, evidence, structure, Brand, disclosure, or approval error exists.
- `review`: no blocking error exists, but a warning such as unknown asset rights requires human judgment.
- `pass`: the contract is structurally eligible for human review; it is not published and not automatically approved.

## Persistence decision

No new DB, Redis schema, file store, or canonical store was created. B2 has a `REPRESENTATIONAL_GAP`: approved CreativeSpec persistence and trusted approval provenance are not yet represented by a canonical runtime store. That gap must be resolved deliberately when an execution workflow requires persistence; consumers must not create an ad hoc parallel SSOT.

## B3 handoff

B3 may consume a validated, human-approved CreativeSpec to implement carousel structure, copy, asset selection, layout, render, and preview. B3 must preserve product-image safety, evidence lineage, asset rights warnings, disclosure requirements, and the distinction between missing data and zero. B3 must not interpret approval as publication authorization.
