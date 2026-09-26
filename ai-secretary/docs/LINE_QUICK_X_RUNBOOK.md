# LINE Research notification and Quick X runbook

## LINE setup

1. Create a LINE Official Account and enable Messaging API in LINE Official Account Manager.
2. Confirm the Messaging API channel in LINE Developers and add the official account as a friend from the destination personal LINE account.
3. Create a Channel Access Token. Store it only as the Vercel Production secret `LINE_CHANNEL_ACCESS_TOKEN`; never paste it into source, GitHub, chat, logs, or the Vault.
4. Get the Messaging API user ID shown as "Your user ID" in LINE Developers. This is not a display name or ordinary LINE ID. Store it as the Vercel Production secret `LINE_USER_ID`.
5. Initially set `X_NOTIFICATION_CHANNEL=both`. Confirm that the next Daily Research reaches both LINE and Slack.
6. After verification, set `X_NOTIFICATION_CHANNEL=line` to send X Research candidates only to LINE.

`APP_BASE_URL` remains the single source of truth for Quick X deep links. Do not create another public base URL variable. Missing LINE secrets cause only LINE delivery to be skipped; they do not roll back Research items or Trend Clusters.

## Production verification

1. Confirm `note-daily-research` completes normally at its existing schedule.
2. Confirm up to three candidates arrive in LINE and open the matching cluster and source in AI Company.
3. Open the source article, enter an opinion by voice or text, and select **この意見でXに予約**.
4. Confirm exactly one draft, its Safety/Fact Gate result, and one Buffer queue item.
5. Confirm `trendClusterId` and the selected item in `sourceResearchIds`.
6. Keep `maxXPostsPerDay=1` for the first production run and inspect the published metrics afterward.

This runbook does not authorize deployment, environment changes, live LINE sends, cron execution, Buffer reservations, X posts, merges, or autopilot changes.
