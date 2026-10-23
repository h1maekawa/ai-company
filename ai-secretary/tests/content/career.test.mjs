import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const source = (name) => pathToFileURL(path.join(process.env.CAREER_SOURCE_DIR, `${name}.ts`));
const workflow = await import(source("workflow"));
const privacy = await import(source("privacy"));
const renderer = await import(source("renderer"));
const publicLinks = await import(source("publicLinks"));
const brand = await import(source("brand"));
const seedWeek1 = await import(source("seedWeek1"));
const bufferGate = await import(source("bufferGate"));
const imageRenderer = await import(source("imageRenderer"));
const ollamaGenerator = await import(source("ollamaGenerator"));
const week1Csv = await import(source("week1Csv"));
const careerStore = await import(source("store"));
const requestProtection = await import(source("requestProtection"));
const week1CsvText = fs.readFileSync(path.join(process.cwd(), "../shukatsu_lab_ready_v1/03_week1_posts.csv"), "utf8");

function knowledgeItems() {
  return Array.from({ length: 7 }, (_, index) => ({
    id: `career-k-${index}`, divisionId: "career", sourceId: "career-source-1", title: `経験 ${index}`,
    summary: `当時に経験した学び ${index}`, bodyPrivate: `面接準備で実際に経験したことを記録します ${index}。準備を見直しました。`,
    topic: ["面接", "ES", "自己分析", "企業研究", "インターン", "失敗からの学び", "選考体験"][index],
    audience: "就活生", evidenceType: "personal_experience", privacyRisk: "clear", verificationStatus: "human_verified",
    createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z",
  }));
}

test("career week creates 7 X drafts and 7 five-slide Instagram drafts, scoped to career", () => {
  const { batch, posts } = workflow.generateCareerWeek({ sources: [], knowledgeItems: knowledgeItems(), batches: [], posts: [], audit: [] }, knowledgeItems().map((item) => item.id), "2026-10-26", new Date("2026-10-21T00:00:00.000Z"));
  assert.equal(batch.divisionId, "career");
  assert.equal(posts.length, 14);
  assert.equal(posts.filter((post) => post.platform === "x").length, 7);
  const carousels = posts.filter((post) => post.platform === "instagram");
  assert.equal(carousels.length, 7);
  assert.ok(carousels.every((post) => post.slides.length === 5 && post.slides.map((slide) => slide.position).join(",") === "1,2,3,4,5"));
  assert.ok(posts.every((post) => post.divisionId === "career" && post.status === "draft" && post.approvedAt === null));
  assert.equal(posts[0].scheduledAt, "2026-10-26T10:00:00.000Z");
});

test("PII-like identity and employer or school references are flagged", () => {
  assert.equal(privacy.checkCareerPrivacy("山田太郎さんが株式会社サンプルで経験した話です").risk, "review_required");
  assert.equal(privacy.checkCareerPrivacy("東京大学の研究室で学んだ話を振り返ります").risk, "review_required");
  assert.equal(privacy.checkCareerPrivacy("電話番号は090-1234-5678です").risk, "review_required");
  assert.equal(privacy.checkCareerPrivacy("連絡先はuser@example.comです").risk, "review_required");
});

test("factuality check flags exaggeration and guarantee claims", () => {
  assert.equal(privacy.checkCareerFactuality("この方法なら必ず内定がもらえます").valueOf(), "review_required");
  assert.equal(privacy.checkCareerFactuality("絶対に通るESの書き方").valueOf(), "review_required");
  assert.equal(privacy.checkCareerFactuality("全員が合格できる選考対策").valueOf(), "review_required");
  assert.equal(privacy.checkCareerFactuality("面接の準備を小さく始めましょう").valueOf(), "clear");
});

test("generation rejects fewer than seven items, topic duplicates, and privacy flagged knowledge", () => {
  const items = knowledgeItems();
  const state = { sources: [], knowledgeItems: items, batches: [], posts: [], audit: [] };
  assert.throws(() => workflow.generateCareerWeek(state, items.slice(0, 6).map((item) => item.id), "2026-10-26"), /SELECT_SEVEN/);
  items[6].topic = items[0].topic;
  assert.throws(() => workflow.generateCareerWeek(state, items.map((item) => item.id), "2026-10-26"), /TOPIC_DUPLICATES/);
  items[6].topic = "distinct"; items[6].privacyRisk = "review_required";
  assert.throws(() => workflow.generateCareerWeek(state, items.map((item) => item.id), "2026-10-26"), /PRIVACY_REVIEW_REQUIRED/);
  items[6].privacyRisk = "clear";
  items[6].verificationStatus = "unverified";
  assert.throws(() => workflow.generateCareerWeek(state, items.map((item) => item.id), "2026-10-26"), /KNOWLEDGE_VERIFICATION_REQUIRED/);
  items[6].verificationStatus = "human_verified";
  assert.throws(() => workflow.generateCareerWeek(state, items.map((item) => item.id), "2026-10-25"), /INVALID_WEEK_START/);
});

test("carousel HTML escapes content, includes strict CSP, and detects overflow", () => {
  const html = renderer.renderCareerCarouselSlide({ position: 1, headline: "<script>alert(1)</script>", body: "safe text" });
  assert.ok(!html.includes("<script>alert(1)</script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("Content-Security-Policy"));
  assert.equal(renderer.careerSlideOverflow({ position: 1, headline: "短い見出し", body: "短い本文" }), false);
  assert.equal(renderer.careerSlideOverflow({ position: 1, headline: "長い見出し".repeat(30), body: "" }), true);
});

test("template detection selects Q&A and HOW-TO templates accurately", () => {
  assert.equal(renderer.detectSlideTemplate({ headline: "就活って何から始めればいい？" }), "qa");
  assert.equal(renderer.detectSlideTemplate({ headline: "自己分析の始め方 5ステップ" }), "howto");
  assert.equal(renderer.detectSlideTemplate({ headline: "面接でよく聞かれる質問と回答" }), "qa");
  assert.equal(renderer.detectSlideTemplate({ headline: "ES通過率を上げる3つの手順" }), "howto");
});

test("Q&A template renders all 5 slides with distinctive semantic blocks", () => {
  const slides = [
    { position: 1, headline: "就活って何から始める？", body: "疑問を解決" },
    { position: 2, headline: "自己分析の棚卸しから", body: "結論" },
    { position: 3, headline: "軸がないと迷うから", body: "理由" },
    { position: 4, headline: "今日できるアクション", body: "具体例" },
    { position: 5, headline: "今日のまとめ", body: "保存して見返す" },
  ];

  for (const s of slides) {
    const html = renderer.renderCareerCarouselSlide(s, { template: "qa", total: 5 });
    assert.ok(html.includes("就活攻略ラボ"));
    assert.ok(html.includes("0" + s.position + " / 05"));
    assert.ok(html.includes("保存して見返す"));
  }
  const issue = renderer.renderCareerCarouselSlide(
    { position: 2, headline: "課題", body: "困りごとの例／先に経験を思い出そう" },
    { template: "qa", total: 5 },
  );
  assert.ok(issue.includes("課題 / 解決策"));
  assert.ok(!issue.includes("ANSWER / 結論"));
});

test("cover slide uses the post title and never presents an unconfirmed Instagram handle as official", () => {
  for (const template of ["qa", "howto"]) {
    const html = renderer.renderCareerCarouselSlide(
      { position: 1, headline: "表紙", body: "自己分析の始め方" },
      { template, total: 5, postTitle: "自己分析はこの5ステップで始めよう" },
    );
    assert.match(html, /<h1[^>]*>\s*自己分析はこの5ステップで始めよう\s*<\/h1>/);
    assert.match(html, /<h1[^>]*font-size: 54px/);
    assert.match(html, /Instagram ID 未確認/);
    assert.doesNotMatch(html, /公式インスタ|@shukatsu\.lab/);
  }
});

test("HOW-TO template renders all 5 slides with numbered step badges", () => {
  const slides = [
    { position: 1, headline: "自己分析 5ステップ", body: "ロードマップ" },
    { position: 2, headline: "経験を書き出す", body: "詳細" },
    { position: 3, headline: "感情を深掘りする", body: "STEP 2とSTEP 3" },
    { position: 4, headline: "共通点を見つける", body: "STEP 4とSTEP 5" },
    { position: 5, headline: "チェックリスト", body: "まとめ" },
  ];

  for (const s of slides) {
    const html = renderer.renderCareerCarouselSlide(s, { template: "howto", total: 5 });
    assert.ok(html.includes("就活攻略ラボ"));
    assert.ok(html.includes("0" + s.position + " / 05"));
  }
  const practice = renderer.renderCareerCarouselSlide(
    { position: 3, headline: "実践", body: "1つ選んで「なぜ頑張れた？」「何を工夫した？」を3回掘り下げる" },
    { template: "howto", total: 5 },
  );
  assert.ok(practice.includes("1つ選んで"));
  assert.ok(practice.includes("なぜ頑張れた"));
  assert.ok(!practice.includes("STEP 02 アクション"));
  assert.ok(!practice.includes("STEP 03 アクション"));
});

test("career LP only exposes validated HTTPS account URLs", () => {
  assert.equal(publicLinks.validateCareerSocialUrl("instagram", "https://www.instagram.com/shukatsu.lab/"), "https://www.instagram.com/shukatsu.lab/");
  assert.equal(publicLinks.validateCareerSocialUrl("x", "https://x.com/shukatsu_lab"), "https://x.com/shukatsu_lab/");
  for (const value of ["http://instagram.com/handle", "https://instagram.com.evil.test/handle", "https://instagram.com/handle?next=evil", "https://instagram.com/explore/handle", "https://user@instagram.com/handle"]) {
    assert.equal(publicLinks.validateCareerSocialUrl("instagram", value), null);
  }
  assert.deepEqual(publicLinks.careerSocialLinks({}), { instagram: null, x: null });
  assert.equal(publicLinks.validateCareerSocialUrl("x", "https://x.com/intent/tweet"), null);
  assert.equal(publicLinks.validateCareerSocialUrl("instagram", "https://instagram.com/explore/"), null);
});

test("brand configuration enforces anonymity and unconfirmed accounts", () => {
  assert.equal(brand.CAREER_BRAND.name, "就活攻略ラボ");
  assert.equal(brand.CAREER_BRAND.social.x.channelStatus, "UNCONFIRMED");
  assert.equal(brand.CAREER_BRAND.social.instagram.channelStatus, "UNCONFIRMED");
  assert.equal(brand.CAREER_BRAND.social.x.bufferChannelId, null);
  assert.equal(brand.CAREER_BRAND.social.instagram.bufferChannelId, null);
});

test("seedWeek1Batch generates exactly 14 posts (7 X, 7 IG x 5 slides) and preserves career scope", () => {
  const state = { sources: [], knowledgeItems: [], batches: [], posts: [], audit: [] };
  const { batch, posts, source, items } = seedWeek1.seedWeek1Batch(state, week1CsvText);

  assert.equal(batch.divisionId, "career");
  assert.equal(source.divisionId, "career");
  assert.equal(items.length, 7);
  assert.ok(items.every((it) => it.divisionId === "career"));
  assert.equal(posts.length, 14);

  const xPosts = posts.filter((p) => p.platform === "x");
  const igPosts = posts.filter((p) => p.platform === "instagram");
  assert.equal(xPosts.length, 7);
  assert.equal(igPosts.length, 7);

  // 35 slides in total
  const totalSlides = igPosts.reduce((sum, p) => sum + p.slides.length, 0);
  assert.equal(totalSlides, 35);

  assert.ok(posts.every((p) => p.divisionId === "career" && p.status === "review" && p.approvedAt === null));

  // A repeated request fails closed without mutating existing records.
  state.batches.push(batch);
  state.posts.push(...posts);
  const before = structuredClone(state);
  assert.throws(() => seedWeek1.seedWeek1Batch(state, week1CsvText), /WEEK1_BATCH_ALREADY_EXISTS/);
  assert.deepEqual(state, before);
});

test("audit-only initial state imports once, retains history, and produces the complete review batch", () => {
  const dryRunAudit = { id: "career_audit_existing", divisionId: "career", action: "buffer_dry_run_executed", at: "2026-10-23T10:00:07.219Z", details: { totalPosts: 0, eligible: 0, blocked: 0, excluded: 0 } };
  const initial = { sources: [], knowledgeItems: [], batches: [], posts: [], audit: [dryRunAudit] };
  const before = structuredClone(initial);
  const imported = seedWeek1.importWeek1CsvIntoState(initial, week1CsvText, undefined, new Date("2026-10-23T11:00:00.000Z"));

  assert.deepEqual(initial, before);
  assert.equal(imported.sources.length, 1);
  assert.equal(imported.knowledgeItems.length, 7);
  assert.equal(imported.batches.length, 1);
  assert.equal(imported.posts.length, 14);
  assert.equal(imported.posts.filter((post) => post.platform === "x").length, 7);
  const carousels = imported.posts.filter((post) => post.platform === "instagram");
  assert.equal(carousels.length, 7);
  assert.equal(carousels.reduce((count, post) => count + post.slides.length, 0), 35);
  assert.ok(imported.posts.every((post) => post.status === "review" && post.approvedAt === null));
  assert.equal(imported.audit.length, 2);
  assert.deepEqual(imported.audit[1], dryRunAudit);

  const afterFirstImport = structuredClone(imported);
  assert.throws(() => seedWeek1.importWeek1CsvIntoState(imported, week1CsvText), /WEEK1_EXISTING_CAREER_DATA/);
  assert.deepEqual(imported, afterFirstImport);
});

test("week 1 CSV is parsed from the official 11-column, 14-row file and matches all imported copy", () => {
  const rows = week1Csv.parseWeek1Csv(week1CsvText);
  assert.equal(week1Csv.WEEK1_CSV_HEADERS.length, 11);
  assert.equal(rows.length, 14);
  assert.equal(rows.filter((row) => row.platform === "x").length, 7);
  assert.equal(rows.filter((row) => row.platform === "instagram").length, 7);
  assert.equal(rows.filter((row) => row.platform === "instagram").reduce((n, row) => n + row.slides.length, 0), 35);

  const { posts } = seedWeek1.seedWeek1Batch({ sources: [], knowledgeItems: [], batches: [], posts: [], audit: [] }, week1CsvText);
  for (const row of rows) {
    const post = posts.find((candidate) => candidate.platform === row.platform && candidate.title === row.title);
    assert.ok(post, `missing ${row.platform} post ${row.title}`);
    assert.equal(post.body, row.platform === "x" ? row.body : "");
    assert.equal(post.caption, row.platform === "instagram" ? row.caption : "");
    assert.equal(post.status, "review");
    if (row.platform === "instagram") {
      assert.equal(post.slides.length, 5);
      for (let i = 0; i < 5; i += 1) {
        const separator = row.slides[i].search(/[：:]/u);
        assert.equal(post.slides[i].headline, separator < 0 ? `Slide ${i + 1}` : row.slides[i].slice(0, separator).trim());
        assert.equal(post.slides[i].body, separator < 0 ? row.slides[i].trim() : row.slides[i].slice(separator + 1).trim());
      }
    }
  }
});

test("invalid CSV and any pre-existing source, knowledge, batch, or post stop without changing state", () => {
  const emptyState = () => ({ sources: [], knowledgeItems: [], batches: [], posts: [], audit: [] });
  for (const [input, code] of [
    [week1CsvText.replace("slide_5", "slide_6"), "CSV_INVALID_HEADERS"],
    [week1CsvText.replace("review_required", "approved"), "CSV_INVALID_STATUS"],
    [week1CsvText.replace(",review_required", ""), "CSV_INVALID_ROW_COUNT_OR_WIDTH"],
    [week1CsvText.replace(",x,", ",youtube,"), "CSV_INVALID_PLATFORM"],
    [`${week1CsvText}\n"unclosed`, "CSV_UNCLOSED_QUOTE"],
  ]) {
    const state = emptyState();
    const before = structuredClone(state);
    assert.throws(() => seedWeek1.seedWeek1Batch(state, input), new RegExp(code));
    assert.deepEqual(state, before);
  }

  const generated = seedWeek1.seedWeek1Batch(emptyState(), week1CsvText);
  const existingRecords = [
    ["sources", generated.source],
    ["knowledgeItems", generated.items[0]],
    ["batches", generated.batch],
    ["posts", generated.posts[0]],
  ];
  for (const [key, record] of existingRecords) {
    const state = emptyState();
    state[key].push(record);
    const before = structuredClone(state);
    assert.throws(() => seedWeek1.importWeek1CsvIntoState(state, week1CsvText), /WEEK1_EXISTING_CAREER_DATA/);
    assert.deepEqual(state, before);
  }

  const auditOnlyJson = JSON.stringify({ ...emptyState(), audit: [{ id: "a", divisionId: "career", action: "buffer_dry_run_executed", at: "2026-10-23T10:00:07.219Z", details: {} }] });
  assert.equal(seedWeek1.parseInitialCareerStateJson(auditOnlyJson).audit.length, 1);
  for (const invalidJson of ["{", "null", "[]", "{}", JSON.stringify({ ...emptyState(), posts: {} }), JSON.stringify({ ...emptyState(), audit: [{ id: "bad", divisionId: "other" }] })]) {
    assert.throws(() => seedWeek1.parseInitialCareerStateJson(invalidJson), /WEEK1_EXISTING_STATE_UNREADABLE/);
  }
});

test("Career state saves and reloads through the existing store in an isolated Vault", () => {
  const dryRunAudit = { id: "audit-old", divisionId: "career", action: "buffer_dry_run_executed", at: "2026-10-23T10:00:07.219Z", details: {} };
  const auditOnly = careerStore.loadCareerState();
  auditOnly.audit.push(dryRunAudit);
  const file = path.join(process.env.VAULT_ROOT, "memory/personal/career/career-state.json");
  careerStore.saveCareerState(auditOnly);
  const reloadedAuditOnly = careerStore.loadCareerState();
  assert.equal(reloadedAuditOnly.posts.length, 0);
  assert.equal(reloadedAuditOnly.audit.length, 1);
  assert.equal(fs.existsSync(`${file}.bak`), false);

  const state = seedWeek1.importWeek1CsvIntoState(reloadedAuditOnly, week1CsvText);
  careerStore.saveCareerState(state);
  const reloaded = careerStore.loadCareerState();
  assert.deepEqual(reloaded, state);
  assert.equal(reloaded.posts.length, 14);
  assert.ok(reloaded.posts.every((post) => post.status === "review" && post.approvedAt === null));
  assert.equal(reloaded.audit.length, 2);
  assert.equal(reloaded.audit[1].id, "audit-old");
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.equal(fs.existsSync(`${file}.bak`), true);
  const backup = JSON.parse(fs.readFileSync(`${file}.bak`, "utf8"));
  assert.equal(backup.posts.length, 0);
  assert.equal(backup.audit.length, 1);
  assert.equal(backup.audit[0].id, "audit-old");
});

test("seed API keeps authentication ahead of Vault reads and contains no Buffer send path", () => {
  const route = fs.readFileSync(path.join(process.cwd(), "app/api/content/career/seed/route.ts"), "utf8");
  assert.ok(route.indexOf("careerRequestAllowed(request, true)") < route.indexOf("resolveVaultPath(WEEK1_CSV_VAULT_PATH)"));
  assert.match(route, /parseInitialCareerStateJson\(fs\.readFileSync\(statePath, "utf8"\)\)/);
  assert.match(route, /importWeek1CsvIntoState\(state, csvText\)/);
  assert.match(route, /openSync\(lockPath, "wx", 0o600\)/);
  assert.ok(route.indexOf("existsSync(backupPath)") < route.indexOf("loadCareerState()"));
  assert.match(route, /errorCode === "EEXIST"/);
  assert.match(route, /errorCode === "ENOENT"/);
  assert.match(route, /finally \{[\s\S]*?closeSync\(lockFd\)[\s\S]*?unlinkSync\(lockPath\)/);
  assert.match(route, /readFileSync\(csvPath, "utf8"\)/);
  assert.doesNotMatch(route, /buffer\.publish|publishToBuffer|scheduleToBuffer/i);
  assert.match(route, /Cache-Control.*no-store/);
});

test("Buffer Dry-Run records only a local audit event and writes no Career content", () => {
  const route = fs.readFileSync(path.join(process.cwd(), "app/api/content/career/dry-run/route.ts"), "utf8");
  assert.match(route, /action: "buffer_dry_run_executed"/);
  assert.match(route, /state\.audit\.unshift/);
  assert.match(route, /saveCareerState\(state\)/);
  assert.doesNotMatch(route, /state\.(sources|knowledgeItems|batches|posts)\.(push|unshift)/);
  assert.doesNotMatch(route, /publish|schedule/i);
});

test("same-origin mutations accept exact local Host in development and reject spoofed or untrusted origins", () => {
  const priorNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  const request = (url, origin, host, forwardedHost) => ({
    nextUrl: new URL(url),
    headers: new Headers({ ...(origin ? { origin } : {}), ...(host ? { host } : {}), ...(forwardedHost ? { "x-forwarded-host": forwardedHost } : {}) }),
  });
  try {
    const requestToNormalizedUrl = request("http://localhost:3000/api/content/career", "http://127.0.0.1:3000", "127.0.0.1:3000");
    assert.equal(requestProtection.isSameOriginMutation(requestToNormalizedUrl, { allowDevelopmentHostMatch: true }), true);
    assert.equal(requestProtection.isSameOriginMutation(requestToNormalizedUrl), false);
    assert.equal(requestProtection.isSameOriginMutation(request("http://127.0.0.1:3000/api/content/career", "http://localhost:3000", "localhost:3000"), { allowDevelopmentHostMatch: true }), true);
    assert.equal(requestProtection.isSameOriginMutation(request("http://localhost:3000/api/content/career", "https://evil.example", "127.0.0.1:3000", "evil.example"), { allowDevelopmentHostMatch: true }), false);
    assert.equal(requestProtection.isSameOriginMutation(request("http://localhost:3001/api/content/career", "http://127.0.0.1:3001", "127.0.0.1:3001"), { allowDevelopmentHostMatch: true }), false);
    assert.equal(requestProtection.isSameOriginMutation(request("https://localhost:3000/api/content/career", "https://127.0.0.1:3000", "127.0.0.1:3000"), { allowDevelopmentHostMatch: true }), false);
    assert.equal(requestProtection.isSameOriginMutation(request("http://localhost:3000/api/content/career", "http://localhost:3000/path", "localhost:3000"), { allowDevelopmentHostMatch: true }), false);
    assert.equal(requestProtection.isSameOriginMutation(request("http://localhost:3000/api/content/career", undefined, "localhost:3000"), { allowDevelopmentHostMatch: true }), false);
    // Forwarded host is not trusted to turn a cross-origin Origin into an allowed one.
    assert.equal(requestProtection.isSameOriginMutation(request("http://localhost:3000/api/content/career", "http://localhost:3000", "127.0.0.1:3000", "localhost:3000"), { allowDevelopmentHostMatch: true }), false);
    process.env.NODE_ENV = "production";
    assert.equal(requestProtection.isSameOriginMutation(requestToNormalizedUrl, { allowDevelopmentHostMatch: true }), false);
  } finally {
    if (priorNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = priorNodeEnv;
  }
});

test("Career GET remains session-authenticated and every Career POST retains the same-origin mutation gate", () => {
  const careerRoute = fs.readFileSync(path.join(process.cwd(), "app/api/content/career/route.ts"), "utf8");
  const seedRoute = fs.readFileSync(path.join(process.cwd(), "app/api/content/career/seed/route.ts"), "utf8");
  assert.match(careerRoute, /GET\(request: NextRequest\)[\s\S]*?careerRequestAllowed\(request\)/);
  assert.match(careerRoute, /POST\(request: NextRequest\)[\s\S]*?careerRequestAllowed\(request, true\)/);
  const careerAuth = fs.readFileSync(path.join(process.cwd(), "app/lib/content/career/auth.ts"), "utf8");
  assert.match(careerAuth, /isSameOriginMutation\(request, \{ allowDevelopmentHostMatch: true \}\)/);
  assert.match(seedRoute, /POST\(request: NextRequest\)[\s\S]*?careerRequestAllowed\(request, true\)/);
  const login = fs.readFileSync(path.join(process.cwd(), "app/api/auth/login/route.ts"), "utf8");
  assert.match(login, /httpOnly: true/);
  assert.match(login, /secure: true/);
  assert.match(login, /sameSite: "lax"/);
});

test("dryRunCareerBuffer fails closed when channels are unconfirmed", () => {
  const state = { sources: [], knowledgeItems: [], batches: [], posts: [], audit: [] };
  const { posts } = seedWeek1.seedWeek1Batch(state, week1CsvText);
  state.posts = posts;

  const report = bufferGate.dryRunCareerBuffer(state);
  assert.equal(report.realPublishBlocked, true);
  assert.equal(report.eligibleCount, 0);
  assert.ok(report.summaryMessage.includes("安全停止中"));
  assert.ok(report.items.every((it) => it.status !== "eligible"));
});

test("dryRunCareerBuffer excludes unapproved posts and checks slide count", () => {
  const state = { sources: [], knowledgeItems: [], batches: [], posts: [], audit: [] };
  const { posts } = seedWeek1.seedWeek1Batch(state, week1CsvText);
  state.posts = posts;

  // With mock verified channels, posts are still excluded because status !== "approved"
  const report = bufferGate.dryRunCareerBuffer(state, { mockVerifiedChannels: true });
  assert.equal(report.realPublishBlocked, true);
  assert.equal(report.eligibleCount, 0);
  assert.equal(report.excludedCount, 14);

  // When approved, eligibleCount increases
  state.posts[0].status = "approved";
  const approvedReport = bufferGate.dryRunCareerBuffer(state, { mockVerifiedChannels: true });
  assert.equal(approvedReport.eligibleCount, 1);

  const xPost = state.posts.find((post) => post.platform === "x");
  assert.ok(xPost);
  xPost.status = "approved";
  xPost.body = "x".repeat(280);
  const atLimit = bufferGate.dryRunCareerBuffer(state, { mockVerifiedChannels: true });
  const atLimitItem = atLimit.items.find((item) => item.postId === xPost.id);
  assert.equal(atLimitItem?.status, "eligible");

  xPost.body += "x";
  const overLimit = bufferGate.dryRunCareerBuffer(state, { mockVerifiedChannels: true });
  const overLimitItem = overLimit.items.find((item) => item.postId === xPost.id);
  assert.equal(overLimitItem?.status, "blocked");
  assert.ok(overLimitItem?.blockReasons.some((reason) => reason.startsWith("X_CHARACTER_LIMIT_EXCEEDED")));
});

test("validateSlideLayout verifies slide content length and flags overflow", () => {
  const validSlide = { position: 1, headline: "自己分析の始め方", body: "まずは経験を3つ書き出してみましょう。" };
  const invalidSlide = { position: 1, headline: "", body: "本文のみ" };
  const overflowSlide = { position: 1, headline: "非常に長い見出し".repeat(20), body: "本文" };

  assert.equal(imageRenderer.validateSlideLayout(validSlide).valid, true);
  assert.equal(imageRenderer.validateSlideLayout(invalidSlide).valid, false);
  assert.equal(imageRenderer.validateSlideLayout(overflowSlide).valid, false);
});

test("path traversal protection strictly blocks illegal post IDs and path escaping", () => {
  // Valid IDs
  assert.doesNotThrow(() => imageRenderer.assertSafePostId("career_post_abc-123"));
  assert.doesNotThrow(() => imageRenderer.assertSafePostId("post-456"));

  // Illegal traversal and characters
  assert.throws(() => imageRenderer.assertSafePostId("../etc/passwd"), /PATH_TRAVERSAL|INVALID_POST_ID/);
  assert.throws(() => imageRenderer.assertSafePostId("post/nested"), /PATH_TRAVERSAL|INVALID_POST_ID/);
  assert.throws(() => imageRenderer.assertSafePostId("..\\windows"), /PATH_TRAVERSAL|INVALID_POST_ID/);
  assert.throws(() => imageRenderer.assertSafePostId(""), /INVALID_POST_ID/);
  assert.throws(() => imageRenderer.assertSafePostId("post!@#$"), /INVALID_POST_ID/);

  // Directory boundary escaping check
  assert.throws(() => imageRenderer.getSafePostDir("../escaped"), /PATH_TRAVERSAL|INVALID_POST_ID/);
});

test("stale image detection flags hash mismatch when post is edited", () => {
  const postId = "test-post-hash-check";
  const { isStale } = imageRenderer.getExistingSlideImages(postId, "expected-hash-value");
  // Non-existent directory returns isStale false safely
  assert.equal(isStale, false);
});

test("extractJsonObject extracts clean JSON from raw text and markdown fences", () => {
  // Plain JSON
  const plain = '{"xBody": "hello", "slides": []}';
  assert.deepEqual(ollamaGenerator.extractJsonObject(plain), { xBody: "hello", slides: [] });

  // Markdown fenced JSON
  const fenced = 'Here is the output:\n```json\n{"xBody": "fenced", "slides": []}\n```\nHope it helps!';
  assert.deepEqual(ollamaGenerator.extractJsonObject(fenced), { xBody: "fenced", slides: [] });

  // Embedded object in conversational text
  const embedded = '思考過程...\n{"xBody": "embedded", "slides": []}\n以上です。';
  assert.deepEqual(ollamaGenerator.extractJsonObject(embedded), { xBody: "embedded", slides: [] });

  // Invalid JSON throws cleanly
  assert.throws(() => ollamaGenerator.extractJsonObject("no json here"), /NO_JSON_OBJECT_FOUND/);
});
