import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const sourceDir = process.env.CAREER_SOURCE_DIR;
if (!sourceDir) throw new Error("CAREER_SOURCE_DIR is required");

const workflow = await import(pathToFileURL(path.join(sourceDir, "workflow.ts")));
const seedWeek1 = await import(pathToFileURL(path.join(sourceDir, "seedWeek1.ts")));
const imageRenderer = await import(pathToFileURL(path.join(sourceDir, "imageRenderer.ts")));
const renderer = await import(pathToFileURL(path.join(sourceDir, "renderer.ts")));
const bufferGate = await import(pathToFileURL(path.join(sourceDir, "bufferGate.ts")));
const ollamaGenerator = await import(pathToFileURL(path.join(sourceDir, "ollamaGenerator.ts")));
const privacy = await import(pathToFileURL(path.join(sourceDir, "privacy.ts")));
const store = await import(pathToFileURL(path.join(sourceDir, "store.ts")));

const RESULTS = {};

async function run() {
  console.log("==================================================");
  console.log("就活SNSローカル検証（コミット e6dad0e、認証UI操作は対象外）");
  console.log("==================================================\n");

  // 1. GitHub Actions CI 結果確認
  console.log("1. GitHub Actions CI 結果確認...");
  RESULTS["1_CI"] = "NOT_VERIFIED: CI state is not queried by this script";
  console.log("   ! CI status is not queried by this script; inspect PR #181 checks separately\n");

  // The shell harness supplies a fresh isolated Vault, so this checks default-state loading only.
  console.log("2. 隔離VaultでのCareer State初期ロード検証...");
  try {
    const initialState = store.loadCareerState();
    assert.ok(initialState, "State must be loaded");
    assert.ok(Array.isArray(initialState.sources));
    assert.ok(Array.isArray(initialState.knowledgeItems));
    assert.ok(Array.isArray(initialState.batches));
    assert.ok(Array.isArray(initialState.posts));
    assert.ok(Array.isArray(initialState.audit));
    RESULTS["2_STUDIO_LOAD"] = "PASS";
    console.log("   ✔ Empty isolated Vault initializes a valid Career state; existing user state was not read\n");
  } catch (err) {
    RESULTS["2_STUDIO_LOAD"] = "FAIL: " + err.message;
    console.error("   ✖", err);
  }

  // 3. Pure in-memory workflow simulation. This does not invoke the authenticated UI or API.
  console.log("3. Xの下書き編集・保存ロジック（メモリ上のシミュレーション）...");
  const testState = { sources: [], knowledgeItems: [], batches: [], posts: [], audit: [] };
  const { batch, posts } = seedWeek1.seedWeek1Batch(testState);
  testState.batches.push(batch);
  testState.posts.push(...posts);

  const xPost = testState.posts.find((p) => p.platform === "x");
  assert.ok(xPost, "Must have X post");
  const originalXBody = xPost.body;
  const newXBody = "【編集後】面接で話が長くなる人は「結論→理由→具体例」の順に話そう。これだけで伝わりやすさが劇的に変わります。まずは今日の1問から練習！ #就活対策";

  // 編集処理
  xPost.body = newXBody;
  xPost.contentHash = store.careerHash(newXBody);
  xPost.updatedAt = new Date().toISOString();
  testState.audit.unshift({
    id: store.careerId("career_audit"),
    divisionId: "career",
    action: "draft_edited",
    at: xPost.updatedAt,
    details: { postId: xPost.id, wasApproved: false },
  });

  assert.equal(xPost.body, newXBody);
  assert.notEqual(xPost.body, originalXBody);
  assert.equal(testState.audit[0].action, "draft_edited");
  RESULTS["3_X_EDIT"] = "SIMULATED";
  console.log("   ✔ X draft edit state/hash/audit assertions passed in memory; UI/API persistence was not exercised\n");

  // 4. Pure in-memory workflow simulation. This does not invoke the authenticated UI or API.
  console.log("4. Instagram 5スライド編集ロジック（メモリ上のシミュレーション）...");
  const igPost = testState.posts.find((p) => p.platform === "instagram");
  assert.ok(igPost, "Must have Instagram post");
  assert.equal(igPost.slides.length, 5);

  const updatedSlides = igPost.slides.map((s) => ({
    ...s,
    headline: `【改訂】${s.headline}`,
    body: `【改訂本文】${s.body}`,
  }));
  igPost.slides = updatedSlides;
  const igContent = `${igPost.caption}\n${updatedSlides.map((s) => `${s.headline}\n${s.body}`).join("\n")}`;
  igPost.contentHash = store.careerHash(igContent);
  igPost.updatedAt = new Date().toISOString();

  assert.ok(igPost.slides.every((s) => s.headline.startsWith("【改訂】")));
  RESULTS["4_IG_5SLIDES_EDIT"] = "SIMULATED";
  console.log("   ✔ Instagram slide/hash assertions passed in memory; UI/API persistence was not exercised\n");

  // 5. テストデータで週35枚のPNG一括生成を実行
  console.log("5. 週次35枚のPNG一括生成を実行中...");
  const allIgPosts = testState.posts.filter((p) => p.platform === "instagram");
  assert.equal(allIgPosts.length, 7, "Must have exactly 7 Instagram posts for week");

  // Keep generated verification files outside the real Vault. Never recursively
  // remove a fixed path that could contain user data.
  const tempImgDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-company-career-images-"));

  const generatedImages = [];
  try {
    for (const post of allIgPosts) {
      const res = await imageRenderer.renderCareerPostImages(post, tempImgDir);
      assert.ok(res.success, `Failed rendering post ${post.id}: ${res.error}`);
      assert.equal(res.images.length, 5);
      generatedImages.push(...res.images);
    }
    assert.equal(generatedImages.length, 35, "Must render exactly 35 slide images");
    RESULTS["5_BATCH_35_PNG"] = "PASS";
    console.log(`   ✔ 35 PNG images successfully rendered (${generatedImages.length}/35)\n`);
  } catch (err) {
    RESULTS["5_BATCH_35_PNG"] = "FAIL: " + err.message;
    console.error("   ✖", err);
  }

  // 6. 各PNGの解像度・文字切れ・内容一致を検証
  console.log("6. 35枚PNGの解像度・文字切れ・内容一致を検証中...");
  try {
    assert.equal(RESULTS["5_BATCH_35_PNG"], "PASS", "Skip image assertions because the batch render did not complete");
    let checkedCount = 0;
    for (const img of generatedImages) {
      const png = fs.readFileSync(img.filePath);
      assert.equal(png.toString("hex", 0, 8), "89504e470d0a1a0a", `Valid PNG signature required for ${img.filePath}`);
      assert.equal(png.readUInt32BE(16), 1080, `Actual PNG width must be 1080 for ${img.filePath}`);
      assert.equal(png.readUInt32BE(20), 1350, `Actual PNG height must be 1350 for ${img.filePath}`);
      assert.equal(img.width, 1080, `Reported width must match PNG for ${img.filePath}`);
      assert.equal(img.height, 1350, `Reported height must match PNG for ${img.filePath}`);
      assert.ok(img.sizeBytes > 50000, `File size must be > 50KB for ${img.filePath}`);
      // This flag is a text-length heuristic, not visual QA or OCR.
      assert.equal(img.hasOverflow, false, `Overflow heuristic triggered on ${img.filePath}`);
      assert.ok(fs.existsSync(img.filePath), `File exists on disk: ${img.filePath}`);
      checkedCount++;
    }
    assert.equal(checkedCount, 35);
    RESULTS["6_PNG_QUALITY_CHECK"] = "PARTIAL: PNG dimensions/signature/file-size and text-length heuristic passed; no visual/OCR check";
    console.log(`   ✔ All 35 PNG files verified: 1080x1350, valid signature/file size, text-length heuristic only (no visual/OCR check)\n`);
  } catch (err) {
    RESULTS["6_PNG_QUALITY_CHECK"] = "FAIL: " + err.message;
    console.error("   ✖", err);
  } finally {
    // クリーンアップ
    try { fs.rmSync(tempImgDir, { recursive: true, force: true }); } catch {}
  }

  // 7. Pure in-memory state simulation; does not call the approval/edit route.
  console.log("7. 承認後編集による失効ロジック（メモリ上のシミュレーション）...");
  try {
    const postToApprove = testState.posts[0];
    postToApprove.status = "approved";
    postToApprove.approvedBy = "test-session";
    postToApprove.approvedAt = new Date().toISOString();
    assert.equal(postToApprove.status, "approved");

    // 編集シミュレーション（承認済み投稿を編集）
    const wasApproved = postToApprove.status === "approved";
    postToApprove.body = "承認後の再編集テキスト";
    if (wasApproved) {
      postToApprove.status = "review";
      postToApprove.approvedBy = null;
      postToApprove.approvedAt = null;
    }
    postToApprove.updatedAt = new Date().toISOString();
    testState.audit.unshift({
      id: store.careerId("career_audit"),
      divisionId: "career",
      action: "draft_edited_approval_revoked",
      at: postToApprove.updatedAt,
      details: { postId: postToApprove.id, wasApproved },
    });

    assert.equal(postToApprove.status, "review");
    assert.equal(postToApprove.approvedBy, null);
    assert.equal(postToApprove.approvedAt, null);
    assert.equal(testState.audit[0].action, "draft_edited_approval_revoked");
    RESULTS["7_APPROVAL_REVOCATION"] = "SIMULATED";
    console.log("   ✔ In-memory assertions revoke approval; authenticated UI/API behavior was not exercised\n");
  } catch (err) {
    RESULTS["7_APPROVAL_REVOCATION"] = "FAIL: " + err.message;
    console.error("   ✖", err);
  }

  // 8. Ollama停止時・不正JSON時・重複実行時の安全停止を確認
  console.log("8. Ollama停止時・不正JSON時・重複実行時の安全停止検証...");
  try {
    // 8-A: 不正JSON時の安全停止
    assert.throws(() => ollamaGenerator.extractJsonObject("This is not JSON at all!"), /NO_JSON_OBJECT_FOUND/);
    console.log("   ✔ 不正JSON時に NO_JSON_OBJECT_FOUND で安全停止");

    // 8-B: Exercise the local model only when it is already running. No external
    // provider fallback is permitted, and absence is reported as BLOCKED.
    try {
      const ollamaBaseUrl = process.env.OLLAMA_URL ?? process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
      const tagsResponse = await fetch(`${ollamaBaseUrl.replace(/\/$/, "")}/api/tags`, { signal: AbortSignal.timeout(1500) });
      assert.ok(tagsResponse.ok, `Ollama /api/tags returned ${tagsResponse.status}`);
      const tags = await tagsResponse.json();
      const requestedModel = process.env.OLLAMA_CAREER_MODEL ?? process.env.OLLAMA_MODEL ?? "qwen3:8b";
      assert.ok((tags.models ?? []).some((model) => model.name === requestedModel || model.name.startsWith(`${requestedModel}:`)), `Requested local model is not installed: ${requestedModel}`);
      const generated = await ollamaGenerator.callOllamaForCareer(
        '日本語で就活準備の短い案を生成し、次の形式に従うこと: {"xBody":"本文","instagramTitle":"タイトル","instagramCaption":"キャプション","slides":[{"headline":"見出し","body":"本文"},{"headline":"見出し","body":"本文"},{"headline":"見出し","body":"本文"},{"headline":"見出し","body":"本文"},{"headline":"見出し","body":"本文"}]',
        "あなたは就活SNSの下書き作成AIです。出力は指定キーをすべて含む有効なJSONオブジェクトのみ。説明文やコードフェンスを付けないでください。",
        60000,
      );
      const parsed = ollamaGenerator.extractJsonObject(generated);
      const hasExpectedSchema = typeof parsed?.xBody === "string" && Array.isArray(parsed?.slides) && parsed.slides.length === 5;
      RESULTS["8_OLLAMA_RUNTIME"] = hasExpectedSchema
        ? "PASS"
        : `PARTIAL: Ollama returned JSON but not the expected content schema (keys: ${Object.keys(parsed ?? {}).join(",") || "none"})`;
      console.log(`   ${hasExpectedSchema ? "✔" : "!"} Local Ollama ${hasExpectedSchema ? "generated expected content schema" : RESULTS["8_OLLAMA_RUNTIME"]} (${requestedModel})`);
    } catch (err) {
      const errorType = err instanceof Error ? err.name : "UNKNOWN_ERROR";
      RESULTS["8_OLLAMA_RUNTIME"] = `BLOCKED: local Ollama unavailable (${errorType})`;
      console.log(`   ! Local Ollama runtime unavailable: ${RESULTS["8_OLLAMA_RUNTIME"]}`);
    }
    assert.throws(() => ollamaGenerator.extractJsonObject("This is not JSON at all!"), /NO_JSON_OBJECT_FOUND/);
    console.log("   ✔ Invalid model output is rejected; external fallback is disabled");

    // 8-C: 重複実行時の冪等性（重複バッチの生成防止）
    const weekStartDate = "2026-10-26";
    const dupState = { sources: [], knowledgeItems: [], batches: [], posts: [], audit: [] };
    const firstSeed = seedWeek1.seedWeek1Batch(dupState, weekStartDate);
    dupState.batches.push(firstSeed.batch);
    dupState.posts.push(...firstSeed.posts);

    const secondSeed = seedWeek1.seedWeek1Batch(dupState, weekStartDate);
    assert.equal(secondSeed.batch.id, firstSeed.batch.id, "Batch must be idempotent");
    assert.equal(dupState.batches.length, 1, "Must not create duplicate batch");
    console.log("   ✔ 重複実行時の冪等性と二重生成防止を確認");

    // 8-D: 二重投稿（重複ハッシュ）のBuffer Dry-run検知
    dupState.posts.push({ ...dupState.posts[0], id: "career_post_dup" });
    const dryRun = bufferGate.dryRunCareerBuffer(dupState);
    assert.ok(dryRun.duplicateHashCount >= 1, "Duplicate hash must be detected");
    console.log("   ✔ Buffer Dry-Run で重複コンテンツハッシュ検知を確認");

    RESULTS["8_FAIL_SAFE_STOP"] = "PARTIAL: malformed JSON and duplicate guards checked; Ollama-offline path not exercised";
    console.log("   ✔ Invalid JSON and duplicate guards checked; offline Ollama path was not exercised\n");
  } catch (err) {
    RESULTS["8_FAIL_SAFE_STOP"] = "FAIL: " + err.message;
    console.error("   ✖", err);
  }

  // Store ownership is asserted by the repository architecture tests, not by this script.
  console.log("9. 共有Store監査のスコープ...");
  RESULTS["9_SHARED_STORE_AUDIT"] = "NOT_VERIFIED_BY_SCRIPT: use repository architecture tests";
  console.log("   ! This verifier does not inspect store ownership; repository architecture tests cover it\n");

  // 10. 総合結果集計
  console.log("==================================================");
  console.log("検証結果一覧");
  console.log("==================================================");
  for (const [k, v] of Object.entries(RESULTS)) {
    console.log(`${k}: ${v}`);
  }
  if (Object.values(RESULTS).some((result) => result.startsWith("FAIL:"))) process.exitCode = 1;
}

run().catch((err) => {
  console.error("Verification suite failed:", err);
  process.exit(1);
});
