import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const sourceDir = process.env.CAREER_SOURCE_DIR;
if (!sourceDir) {
  throw new Error("CAREER_SOURCE_DIR is required");
}

const renderer = await import(pathToFileURL(path.join(sourceDir, "renderer.ts")));
const imageRenderer = await import(pathToFileURL(path.join(sourceDir, "imageRenderer.ts")));

const BASE_OUT = path.resolve(process.cwd(), "memory/personal/career/samples");
fs.mkdirSync(path.join(BASE_OUT, "qa"), { recursive: true });
fs.mkdirSync(path.join(BASE_OUT, "howto"), { recursive: true });

const qaSlides = [
  { position: 1, headline: "就活って何から始めればいい？", body: "「何から手を付ければいいかわからない」と悩む就活生へ。最初の一歩をわかりやすく解説します。" },
  { position: 2, headline: "まずは「自己分析の棚卸し」から始めよう", body: "いきなり求人を見るのではなく、自分が「何に興味があり」「どんな経験をしてきたか」を書き出すことからスタート。" },
  { position: 3, headline: "軸がないまま進むと面接・ESで必ず迷うから", body: "企業研究やES作成を先にやると、志望動機が浅くなり「なぜうちの会社？」の質問に答えられなくなります。自分の軸がすべての土台。" },
  { position: 4, headline: "今日できる10分アクション", body: "【NG】いきなり業界ランキングを丸暗記\n【OK】大学生活で「一番夢中になったこと」をノートに3つ箇条書きで書き出してみる" },
  { position: 5, headline: "今日のまとめ：軸を言語化しよう", body: "1. 求人より先に自分の経験を振り返る\n2. 夢中になったことを3つ書く\n3. 後回しにせず今日10分試す\n\n迷ったときはいつでも見返せるように保存！" },
];

const howtoSlides = [
  { position: 1, headline: "自己分析の始め方 5ステップ", body: "初心者でも今日からできる実践ロードマップ。特別な実績がなくても、この手順通りに進めれば自分らしい軸が作れます。" },
  { position: 2, headline: "過去の経験を時系列で書き出す", body: "小学校・中学・高校・大学で「頑張ったこと」「楽しかったこと」「苦しかったこと」をノートに思いつく限り箇条書き。" },
  { position: 3, headline: "感情が動いた瞬間を深掘りする", body: "STEP 02：感情が動いた瞬間をピックアップ\nなぜ嬉しかった？なぜ悔しかった？感情の背景を自問自答。\n\nSTEP 03：具体的な行動と工夫を言語化\nその時、自分は何を考えてどんな工夫をしたのか具体的に書く。" },
  { position: 4, headline: "共通する行動パターンを見つける", body: "STEP 04：共通する行動パターンを抽出\n複数のエピソードから「自分らしさ（強み）」の共通点を見つける。\n\nSTEP 05：仕事でどう活かせるか考える\nその強みが社会や志望職種でどう役立つか言葉にする。" },
  { position: 5, headline: "5ステップのチェックリスト", body: "✔ STEP 1：経験の洗い出し\n✔ STEP 2：感情の深掘り\n✔ STEP 3：工夫の言語化\n✔ STEP 4：共通点の発見\n✔ STEP 5：強みの接続\n\n保存して週末に実践しよう！" },
];

async function renderSlide(slide, template, outPath) {
  const html = renderer.renderCareerCarouselSlide(slide, { template, total: 5 });
  const tempHtml = `${outPath}.tmp.html`;
  fs.writeFileSync(tempHtml, html, "utf-8");
  try {
    await execFileAsync(CHROME_PATH, [
      "--headless",
      "--disable-gpu",
      "--disable-javascript",
      "--hide-scrollbars",
      "--window-size=1080,1350",
      `--screenshot=${outPath}`,
      `file://${tempHtml}`,
    ], { timeout: 15000 });
    console.log(`Rendered: ${outPath} (${fs.statSync(outPath).size} bytes)`);
  } finally {
    if (fs.existsSync(tempHtml)) fs.unlinkSync(tempHtml);
  }
}

async function main() {
  console.log("=== Generating Q&A Sample Slides (5 images) ===");
  const qaPaths = [];
  for (const s of qaSlides) {
    const out = path.join(BASE_OUT, "qa", `slide-${s.position}.png`);
    await renderSlide(s, "qa", out);
    qaPaths.push(out);
  }

  console.log("=== Generating HOW-TO Sample Slides (5 images) ===");
  const howtoPaths = [];
  for (const s of howtoSlides) {
    const out = path.join(BASE_OUT, "howto", `slide-${s.position}.png`);
    await renderSlide(s, "howto", out);
    howtoPaths.push(out);
  }

  console.log("=== Generating Contact Sheet / Preview Grids ===");
  const qaGrid = path.join(BASE_OUT, "qa-preview-grid.png");
  await imageRenderer.renderCarouselContactSheet("Q&A型：就活って何から始めればいい？", qaPaths, qaGrid);
  console.log(`Rendered QA Grid: ${qaGrid}`);

  const howtoGrid = path.join(BASE_OUT, "howto-preview-grid.png");
  await imageRenderer.renderCarouselContactSheet("HOW-TO型：自己分析の始め方5ステップ", howtoPaths, howtoGrid);
  console.log(`Rendered HOW-TO Grid: ${howtoGrid}`);

  console.log("=== All 10 slides + 2 preview grids successfully created! ===");
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
