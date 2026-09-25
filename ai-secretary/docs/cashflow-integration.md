# Crestix CF integration

The existing Next.js application calls the Crestix CF service only from the server. It
never imports Supabase, queries CF tables, or recalculates the 13-week forecast. The four
registered tools are `get_cashflow_summary`, `get_cashflow_week_detail`,
`get_cashflow_alerts`, and `simulate_cashflow_scenario`.

## Configuration

- `CRESTIX_CF_MODE=mock` enables the deterministic Preview fixture.
- `CRESTIX_CF_MODE=remote` requires server-only `CRESTIX_CF_SERVICE_URL` and
  `CRESTIX_CF_SERVICE_TOKEN`.
- Any other mode is fail-closed with `CF_NOT_CONFIGURED`.

No value uses `NEXT_PUBLIC_`. The token is never returned to the browser or written to
logs. Requests contain only the tool input and never a client-selected company ID. The
remote CF adapter must authenticate the caller and resolve its authorized company before
invoking the CF service.

## Contract and behavior

Responses must be `cashflow:v1`, JPY safe integers, `YYYY-MM-DD`, and `Asia/Tokyo`.
The client enforces an eight-second timeout and distinguishes authentication,
authorization, unavailability, and contract errors. The chat route deterministically
routes strongly identified CF questions before calling an LLM. Numbers and Scenario
comparisons therefore remain CF Engine results; the language model is not asked to
calculate them.

Scenario calls are read-only and ephemeral. Base and Scenario values are visibly
separated. Production remains disabled until crestix-ai's signed-cookie identity can be
securely mapped to a Supabase-authenticated CF company without accepting arbitrary
`company_id` or exposing a service-role key.
