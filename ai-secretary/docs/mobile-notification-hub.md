# Mobile Notification Hub

NotificationはApprovalやMissionのBusiness SSOTではありません。既存Execution StoreのPending Approvalと未解決Attentionから読み取り専用Eventを生成し、channel adapterへ配送します。

```text
Approval / Mission Attention (SSOT)
  -> NotificationEvent (derived)
  -> delivery fingerprint / idempotency
  -> Slack adapter
  -> Mobile deep link
  -> authenticated AI Company Approval UI
  -> existing Approval service / Mission transition
```

## Slack setup

Server-side environmentだけに次を設定します。

- `SLACK_SIGNING_SECRET`: Interactive requestの署名・timestamp検証
- `SLACK_WEBHOOK_URL`、または`SLACK_BOT_TOKEN` + `SLACK_CHANNEL_ID`: 通知配送
- `SLACK_AUTHORIZED_USER_IDS`: R0〜R2をSlackから承認できるCEO user IDのallowlist
- `APP_BASE_URL`: Mobile deep linkのorigin

R3/R4、Investment Trade、Credential change、Protected Core、Production deploymentはSlackで承認できません。詳細画面へのDeep Linkだけを提示します。Slack payloadはApproval本文を持たず、`approvalId`からserver-side SSOTを再取得します。

配送失敗はApprovalやMissionを変更しません。同一source fingerprintはDelivery idempotencyで重複送信を抑止します。

## Optional channels

`NotificationAdapter`はSlack、Notion、Obsidianを識別できますが、初期版で実配送するのはSlackだけです。Notion/ObsidianはSSOTや重要Actionの入力にはせず、将来のDecision Log / Knowledge Archive用adapterとして追加します。
