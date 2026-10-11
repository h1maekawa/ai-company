# Instagram IG-0 Preflight Audit

> Scope: Foundation / SSOT extension only  
> Baseline: `main` at `59dafed`  
> Production data, providers, credentials, Cron, and external publication are unchanged.

## Existing implementation

| Concern | Canonical implementation on main | IG-0 decision |
|---|---|---|
| Brand | `app/lib/content/brandProfile.ts` | Reuse; no Instagram duplicate |
| Creative contract | `app/lib/content/instagram/creativeSpec.ts` | Reuse; reference shared product/asset identities |
| Templates | `app/lib/content/instagram/templates.ts` | Reuse unchanged |
| Content store | `app/lib/content/core/store.ts` | Add optional Product and Media Asset dimensions |
| Published content | `app/lib/content/monetization/types.ts`, Note research store | Extend `PublishChannel`; do not create Instagram publication truth |
| Publish pipeline | Note/X APIs and Buffer adapter | Keep unchanged; Instagram returns `INSTAGRAM_PUBLISH_NOT_CONFIGURED` |
| Performance | shared `PerformanceSnapshot` and content performance file | Reuse; allow Instagram dimension without provider claims |
| Revenue / monetization | Offer, CTA, RevenueEvent plus Company Revenue Ledger | Reference Offer IDs only; no second ledger |
| Materials | Content Core Material providers | Keep separate from binary Media Asset metadata |
| Persistence / migration | versioned Markdown+JSON Vault; additive optional fields | No DB/Redis migration; missing arrays load as empty |
| UI | `/content/instagram` Foundation Page | Operating Page foundation with truthful status |

## Writer / mutation audit

- Product and Media Asset metadata write only through the shared Content Core store.
- Personal Experience enters unconfirmed. A separate explicit confirmation action records `confirmedByUser` and `confirmedAt`.
- `personalExperienceForCreative` exposes no unconfirmed experience to creative consumers.
- Asset validation rejects embedded binary data and generated real-product representation.
- Instagram publication remains unavailable. The generic manual publication route fails closed with HTTP 503 rather than recording fake success.

## SSOT and migration conclusion

IG-0 does not introduce an Instagram Research, Performance, Revenue, Learning, PublishedContent, or persistence store. `products` and `mediaAssets` are additive dimensions of the existing Content Core document, so old files remain readable and rollback requires only reverting code. No Production data rewrite is needed.

## Shared dependency regression boundary

- X DailyX, Safety, Fact, Hot Confidence, Publish Eligibility, Buffer, Canary, and Performance implementations are not changed.
- Note Draft, paid publication Human Gate, and Revenue tracking are not changed.
- Investment code and HUMAN_ONLY trade boundary are not changed.

## Explicitly deferred

Carousel/image rendering, Reel/MP4/TTS, Instagram Production publishing, provider metrics, Affiliate application, Link Hub, Trial Reels, Growth Learning, Creator Marketplace, Brand Deal CRM, and UGC workflows remain `NOT_IMPLEMENTED` or `NOT_CONFIGURED` for later phases.
