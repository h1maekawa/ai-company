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
