import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CareerPost, CareerSlide } from "./types";
import { careerCarouselHtml, careerSlideOverflow, detectSlideTemplate, renderCareerCarouselSlide } from "./renderer";

const execFileAsync = promisify(execFile);

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUTPUT_DIR = path.resolve(process.cwd(), "memory/personal/career/images");

export type SlideImageMetadata = {
  postId: string;
  position: number;
  filePath: string;
  width: number;
  height: number;
  sizeBytes: number;
  hasOverflow: boolean;
};

export type PostImageRenderResult = {
  postId: string;
  success: boolean;
  contentHash: string;
  images: SlideImageMetadata[];
  contactSheetPath?: string;
  error?: string;
};

/**
 * パストラバーサル防止のためのIDバリデーション
 */
export function assertSafePostId(postId: string): void {
  if (!postId || typeof postId !== "string") {
    throw new Error("INVALID_POST_ID: Post ID must be a non-empty string");
  }
  // 英数字・ハイフン・アンダースコアのみ許容
  if (!/^[a-zA-Z0-9_-]{3,64}$/.test(postId)) {
    throw new Error("INVALID_POST_ID_FORMAT: Post ID contains illegal characters");
  }
  // 相対パス記号を含まないこと
  if (postId.includes("..") || postId.includes("/") || postId.includes("\\")) {
    throw new Error("PATH_TRAVERSAL_DETECTED: Illegal path traversal sequence in post ID");
  }
}

/**
 * 安全な保存先パスの解決と検証
 */
export function getSafePostDir(postId: string, baseDir = OUTPUT_DIR): string {
  assertSafePostId(postId);
  const resolvedBase = path.resolve(baseDir);
  const targetDir = path.resolve(resolvedBase, postId);

  // 対象パスが必ず baseDir 配下であることを検証
  if (!targetDir.startsWith(resolvedBase + path.sep)) {
    throw new Error("PATH_TRAVERSAL_DETECTED: Target path escapes output root");
  }

  return targetDir;
}

/**
 * スライドのテキスト長およびオーバーフローを検証
 */
export function validateSlideLayout(slide: CareerSlide): { valid: boolean; reason?: string } {
  if (!slide.headline.trim()) {
    return { valid: false, reason: "見出しが空です" };
  }
  if (!slide.body.trim()) {
    return { valid: false, reason: "本文が空です" };
  }
  if (careerSlideOverflow(slide)) {
    return { valid: false, reason: "文字数が制限を超えており、スライド上で文字切れする可能性があります" };
  }
  return { valid: true };
}

/**
 * 1枚のスライドHTMLをChrome Headlessを使って1080x1350 PNGとしてレンダリング・保存
 * JavaScriptの実行を無効化（--disable-javascript）して安全性を確保。
 */
export async function renderSlideToPng(
  slide: CareerSlide,
  outputPath: string,
  options?: { template?: "qa" | "howto"; total?: number; postTitle?: string }
): Promise<{ sizeBytes: number }> {
  if (!fs.existsSync(CHROME_PATH)) {
    throw new Error(`CHROME_NOT_FOUND: Headless renderer requires Google Chrome at ${CHROME_PATH}`);
  }

  const html = renderCareerCarouselSlide(slide, {
    template: options?.template,
    total: options?.total ?? 5,
    postTitle: options?.postTitle,
  });

  const tempHtmlPath = `${outputPath}.tmp.html`;

  try {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(tempHtmlPath, html, "utf-8");

    // Headless Chrome で 1080x1350 スクリーンショット撮影
    // --disable-javascript でスクリプト実行を遮断
    await execFileAsync(CHROME_PATH, [
      "--headless",
      "--disable-gpu",
      "--disable-javascript",
      "--hide-scrollbars",
      "--window-size=1080,1350",
      `--screenshot=${outputPath}`,
      `file://${tempHtmlPath}`,
    ], { timeout: 15000 });

    if (!fs.existsSync(outputPath)) {
      throw new Error(`Screenshot failed to produce output at ${outputPath}`);
    }

    const stat = fs.statSync(outputPath);
    return { sizeBytes: stat.size };
  } finally {
    if (fs.existsSync(tempHtmlPath)) {
      try { fs.unlinkSync(tempHtmlPath); } catch {}
    }
  }
}

/**
 * Instagram投稿の全5スライドを一括PNGレンダリング
 */
export async function renderCareerPostImages(
  post: CareerPost,
  baseOutputDir = OUTPUT_DIR
): Promise<PostImageRenderResult> {
  if (post.platform !== "instagram") {
    return { postId: post.id, success: false, contentHash: post.contentHash, images: [], error: "NOT_AN_INSTAGRAM_POST" };
  }

  if (!post.slides || post.slides.length !== 5) {
    return { postId: post.id, success: false, contentHash: post.contentHash, images: [], error: "INVALID_SLIDE_COUNT_MUST_BE_5" };
  }

  const postDir = getSafePostDir(post.id, baseOutputDir);
  const template = detectSlideTemplate(post);
  const results: SlideImageMetadata[] = [];

  for (const slide of post.slides) {
    const filePath = path.join(postDir, `slide-${slide.position}.png`);
    const overflow = careerSlideOverflow(slide);

    try {
      const { sizeBytes } = await renderSlideToPng(slide, filePath, {
        template,
        total: post.slides.length,
        postTitle: post.title,
      });

      results.push({
        postId: post.id,
        position: slide.position,
        filePath,
        width: 1080,
        height: 1350,
        sizeBytes,
        hasOverflow: overflow,
      });
    } catch (err) {
      return {
        postId: post.id,
        success: false,
        contentHash: post.contentHash,
        images: results,
        error: `Failed to render slide ${slide.position}: ${(err as Error).message}`,
      };
    }
  }

  // 整合性メタデータ（contentHash、レンダリング日時など）を保存
  const metaPath = path.join(postDir, "metadata.json");
  const metaContent = {
    postId: post.id,
    contentHash: post.contentHash,
    renderedAt: new Date().toISOString(),
    template,
    slideCount: results.length,
  };
  fs.writeFileSync(metaPath, JSON.stringify(metaContent, null, 2), "utf-8");

  return { postId: post.id, success: true, contentHash: post.contentHash, images: results };
}

/**
 * 複数のスライド画像（または投稿）を一覧で確認できるコンタクトシート（グリッド画像）をレンダリング
 */
export async function renderCarouselContactSheet(
  title: string,
  slideImagePaths: string[],
  outputSheetPath: string
): Promise<string> {
  if (!fs.existsSync(CHROME_PATH)) {
    throw new Error(`CHROME_NOT_FOUND: Google Chrome required at ${CHROME_PATH}`);
  }

  fs.mkdirSync(path.dirname(outputSheetPath), { recursive: true });

  const tempHtml = `${outputSheetPath}.sheet.tmp.html`;
  const cardsHtml = slideImagePaths.map((p, idx) => {
    return `
      <div style="display: flex; flex-direction: column; align-items: center; background: #FFFFFF; padding: 16px; border-radius: 16px; box-shadow: 0 4px 16px rgba(0,0,0,0.06); border: 1px solid #E2E8F0;">
        <span style="font-size: 14px; font-weight: 700; color: #152A48; margin-bottom: 8px;">Slide ${idx + 1}</span>
        <img src="file://${p}" style="width: 270px; height: 337.5px; border-radius: 8px; border: 1px solid #CBD5E1; object-fit: cover;" />
      </div>
    `;
  }).join("");

  const sheetHtml = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: 1600px;
      padding: 40px;
      background: #F1F5F9;
      font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", sans-serif;
    }
    .sheet-title {
      font-size: 32px;
      font-weight: 800;
      color: #152A48;
      margin-bottom: 24px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 20px;
    }
  </style>
</head>
<body>
  <div class="sheet-title">
    <span>就活攻略ラボ ｜ カルーセル一覧プレビュー</span>
    <span style="font-size: 18px; font-weight: 600; color: #64748B;">(${title})</span>
  </div>
  <div class="grid">
    ${cardsHtml}
  </div>
</body>
</html>`;

  try {
    fs.writeFileSync(tempHtml, sheetHtml, "utf-8");
    await execFileAsync(CHROME_PATH, [
      "--headless",
      "--disable-gpu",
      "--hide-scrollbars",
      "--window-size=1600,600",
      `--screenshot=${outputSheetPath}`,
      `file://${tempHtml}`,
    ], { timeout: 15000 });

    return outputSheetPath;
  } finally {
    if (fs.existsSync(tempHtml)) {
      try { fs.unlinkSync(tempHtml); } catch {}
    }
  }
}

/**
 * 既存のレンダリング済み画像メタデータを取得し、投稿本文の contentHash と整合しているか検証
 */
export function getExistingSlideImages(
  postId: string,
  expectedContentHash?: string,
  baseOutputDir = OUTPUT_DIR
): { images: SlideImageMetadata[]; isStale: boolean } {
  try {
    assertSafePostId(postId);
  } catch {
    return { images: [], isStale: false };
  }

  const postDir = getSafePostDir(postId, baseOutputDir);
  if (!fs.existsSync(postDir)) return { images: [], isStale: false };

  let isStale = false;
  const metaPath = path.join(postDir, "metadata.json");
  if (fs.existsSync(metaPath) && expectedContentHash) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
      if (meta.contentHash !== expectedContentHash) {
        isStale = true; // 本文が編集されハッシュが一致しない
      }
    } catch {}
  }

  const images: SlideImageMetadata[] = [];
  for (let pos = 1; pos <= 5; pos++) {
    const filePath = path.join(postDir, `slide-${pos}.png`);
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      images.push({
        postId,
        position: pos,
        filePath,
        width: 1080,
        height: 1350,
        sizeBytes: stat.size,
        hasOverflow: false,
      });
    }
  }
  return { images, isStale };
}
