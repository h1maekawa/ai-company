import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const projection = await import(path.join(process.env.QA_DIST, "out/app/lib/company/execution/uiProjection.js"));

test("Mission statuses project to the four Simple Office columns", () => {
  assert.deepEqual(projection.TASK_BOARD_COLUMNS.map((column) => column.label), [
    "やること",
    "進行中",
    "CEO確認待ち",
    "完了",
  ]);
  assert.deepEqual(projection.projectMissionForUi("PLANNED"), { column: "todo", status: "待機中" });
  assert.deepEqual(projection.projectMissionForUi("EXECUTING"), { column: "progress", status: "作業中" });
  assert.deepEqual(projection.projectMissionForUi("REVIEWING"), { column: "progress", status: "レビュー中" });
  assert.deepEqual(projection.projectMissionForUi("WAITING_APPROVAL"), { column: "ceo_review", status: "CEO確認待ち" });
  assert.deepEqual(projection.projectMissionForUi("FAILED"), { column: "todo", status: "問題あり" });
  assert.deepEqual(projection.projectMissionForUi("COMPLETED"), { column: "done", status: "完了" });
});

test("Office summary counts people by the status they are shown with", () => {
  assert.deepEqual(
    projection.summarizeOffice(["作業中", "レビュー中", "待機中", "完了", "CEO確認待ち", "問題あり"]),
    { working: 2, idle: 2, ceoReview: 1, problem: 1 },
  );
  assert.deepEqual(projection.summarizeOffice([]), { working: 0, idle: 0, ceoReview: 0, problem: 0 });
});

test("Current step comes from the plan only, and prefers the running step", () => {
  const steps = [
    { order: 2, title: "市場データを整理", status: "RUNNING" },
    { order: 1, title: "競合を洗い出す", status: "COMPLETE" },
    { order: 3, title: "レポートを作る", status: "PENDING" },
  ];
  assert.deepEqual(projection.projectCurrentStep(steps), { title: "市場データを整理", index: 2, total: 3 });

  // RUNNING が無ければ、未完了の先頭を現在地とみなす
  assert.deepEqual(
    projection.projectCurrentStep([
      { order: 1, title: "調べる", status: "COMPLETE" },
      { order: 2, title: "書く", status: "PENDING" },
    ]),
    { title: "書く", index: 2, total: 2 },
  );

  // Planが無い / 全て完了しているときは何も表示しない
  assert.equal(projection.projectCurrentStep([]), undefined);
  assert.equal(
    projection.projectCurrentStep([{ order: 1, title: "調べる", status: "COMPLETE" }]),
    undefined,
  );
});

test("Wait reason only uses reasons the backend recorded", () => {
  assert.equal(
    projection.projectWaitReason({ status: "CEO確認待ち", pendingApprovalTitle: "記事タイトルの承認" }),
    "記事タイトルの承認",
  );
  assert.equal(projection.projectWaitReason({ status: "CEO確認待ち" }), "CEOの承認を待っています");

  // BLOCKEDの理由 → cancelReason → 遷移理由 の順で拾う
  assert.equal(
    projection.projectWaitReason({
      status: "問題あり",
      blockedActionReason: "必要データ不足",
      cancelReason: "使わない",
    }),
    "必要データ不足",
  );
  assert.equal(
    projection.projectWaitReason({ status: "問題あり", lastTransitionReason: "レビュー不合格" }),
    "レビュー不合格",
  );
  assert.equal(projection.projectWaitReason({ status: "問題あり" }), "理由が記録されていません");

  // 動いている状態では理由を出さない
  assert.equal(projection.projectWaitReason({ status: "作業中" }), undefined);
  assert.equal(projection.projectWaitReason({ status: "完了" }), undefined);
});
