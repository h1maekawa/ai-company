import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");

test("LINE uses the Notification Hub and keeps secrets server-side", () => {
  const types = read("app/lib/notifications/types.ts");
  const line = read("app/lib/notifications/line.ts");
  const research = read("app/lib/notifications/xResearch.ts");
  const cron = read("app/api/cron/note-daily-research/route.ts");
  assert.match(types, /"line"/);
  assert.match(types, /"content"/);
  assert.match(line, /api\.line\.me\/v2\/bot\/message\/push/);
  assert.match(line, /LINE_CHANNEL_ACCESS_TOKEN/);
  assert.match(line, /LINE_USER_ID/);
  assert.match(line, /status: "SKIPPED"/);
  assert.doesNotMatch(line, /NEXT_PUBLIC_LINE|console\./);
  assert.match(research, /x-research:\$\{tokyoDate\(now\)\}:\$\{cluster\.id\}/);
  assert.match(research, /clusterId/);
  assert.match(research, /sourceItemId/);
  assert.match(research, /quickX: "1"/);
  assert.match(line, /AI Companyでこの候補を開く/);
  assert.match(line, /リンク先で元記事を確認し、音声またはテキスト/);
  assert.doesNotMatch(line, /元記事・詳細/);
  assert.match(research, /value === "line" \|\| value === "both"/);
  assert.match(cron, /deliverNotifications/);
  assert.match(cron, /slackDelivered/);
  assert.match(cron, /lineDelivered/);
});

test("Slack content notification is an AI Company entry point", () => {
  const slack = read("app/lib/notifications/slack.ts");
  assert.match(slack, /event\.sourceType === "content" \? "AI Companyで開く" : "AI Companyで確認"/);
  assert.match(slack, /notificationDeepLink\(event\)/);
});

test("Quick X validates source and opinion, generates one draft, and queues through Buffer", () => {
  const route = read("app/api/note/content/generate/route.ts");
  const generate = read("app/lib/note/research/generate.ts");
  const ui = read("components/note/growth/XQuickOpinion.tsx");
  assert.match(route, /!cluster\.researchItemIds\.includes\(body\.sourceItemId\)/);
  assert.match(route, /variantMode === "opinion-only" && !body\.personalAngle\?\.trim\(\)/);
  assert.match(route, /brandFile\.xAccounts\[0\]/);
  assert.match(generate, /sourceResearchIds: input\.sourceResearchIds/);
  assert.match(generate, /variantMode === "opinion-only" \? 1/);
  assert.match(ui, /status === "candidate" && !cluster\.blocked/);
  assert.match(ui, /SpeechRecognition/);
  assert.match(ui, /lang = "ja-JP"/);
  assert.match(ui, /mode: "addToQueue"/);
  assert.match(ui, /`quick-x:\$\{draft\.id\}`/);
  assert.match(ui, /target="_blank" rel="noopener noreferrer"/);
  assert.match(ui, /投稿案は保存しましたが/);
  assert.match(ui, /通知から開いた候補/);
  assert.match(ui, /この候補は現在利用できません。最新候補から選択してください。/);
  assert.match(ui, /他の候補を見る/);
  assert.match(ui, />元記事を開く</);
});
