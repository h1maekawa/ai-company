import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DIST = process.env.MAEMICHI_DIST;
const questions = await import(path.join(DIST, "integrations/slack/editorial-questions.js"));
const conversation = await import(path.join(DIST, "integrations/slack/conversation.js"));

test("投資ニュースでは2〜4問の壁打ちを行う", () => {
  const result = questions.editorialQuestions({
    title: "AI半導体の決算",
    genreIds: ["asset-building"],
  });
  assert.ok(result.length >= 2 && result.length <= 4);
  assert.equal(result[0].category, "interest");
  assert.ok(result.some((item) => item.category === "uncertainty"));
});

test("まだ分からないを消さずに本人意見へ分類する", () => {
  const viewpoint = questions.captureViewpoint([
    { questionId: "interest", rawText: "GPU以外への広がり", answeredAt: "2026-08-04T00:00:00.000Z" },
    { questionId: "opinion", rawText: "メモリも追いかけたい", answeredAt: "2026-08-04T00:01:00.000Z" },
    { questionId: "uncertainty", rawText: "どこまで続くかはまだ分からない", answeredAt: "2026-08-04T00:02:00.000Z" },
    { questionId: "experience", rawText: "ありません", answeredAt: "2026-08-04T00:03:00.000Z" },
  ]);
  assert.equal(viewpoint.mainOpinion, "メモリも追いかけたい");
  assert.deepEqual(viewpoint.uncertainties, ["どこまで続くかはまだ分からない"]);
  assert.deepEqual(viewpoint.experiences, []);
  assert.equal(viewpoint.confirmedByUser, false);
});

test("本人の回答と確認意図を会話から分離する", () => {
  assert.equal(conversation.classifyConversation("私はメモリが気になる").type, "answer");
  assert.equal(conversation.classifyConversation("この内容で合っています").type, "confirm-viewpoint");
  assert.equal(conversation.classifyConversation("少し修正したい").type, "edit-viewpoint");
});

test("ボタン経由の旧直接生成アクションを廃止する", () => {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), "app/lib/integrations/slack/blocks.ts"),
    "utf8"
  );
  assert.doesNotMatch(source, /maemichi_make_x|maemichi_make_free_note|maemichi_make_paid_note|maemichi_make_both/);
  assert.match(source, /maemichi_start_thinking/);
  assert.match(source, /maemichi_confirm_viewpoint/);
});

test("共通生成サービスは本人確認なしで停止する", () => {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), "app/lib/integrations/slack/generate.ts"),
    "utf8"
  );
  assert.match(source, /confirmedByUser/);
  assert.match(source, /本人の考えを確認するまで下書きは生成しません/);
});
