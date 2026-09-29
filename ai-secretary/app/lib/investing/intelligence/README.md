# Investment Intelligence daily schedule

Vercel Cron uses UTC. Weekday runs are staged so each responsibility can fail and retry independently:

- macro/news: `21:30 UTC` (next day `06:30 JST`)
- market/sector: `21:40 UTC` (next day `06:40 JST`)
- opportunity scan: `21:50 UTC` (next day `06:50 JST`)
- notification: `22:20 UTC` (next day `07:20 JST`, after the existing note/X jobs)

Every route requires `CRON_SECRET`, honors `INVESTING_INTELLIGENCE_ENABLED`, and uses a stage/date lock. Missing providers are recorded as `NOT_CONFIGURED`; they never generate synthetic values.
