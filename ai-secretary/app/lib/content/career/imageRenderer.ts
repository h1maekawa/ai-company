import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CareerPost, CareerSlide } from "./types";
import { careerSlideOverflow, renderCareerCarouselSlide } from "./renderer";

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
  images: SlideImageMetadata[];
  error?: string;
};

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
 */
export async function renderSlideToPng(
  slide: CareerSlide,
  outputPath: string
): Promise<{ sizeBytes: number }> {
  if (!fs.existsSync(CHROME_PATH)) {
    throw new Error(`CHROME_NOT_FOUND: Headless renderer requires Google Chrome at ${CHROME_PATH}`);
  }

  const html = renderCareerCarouselSlide(slide);
  const tempHtmlPath = `${outputPath}.tmp.html`;

  try {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(tempHtmlPath, html, "utf-8");

    // Headless Chrome で 1080x1350 スクリーンショット撮影
    await execFileAsync(CHROME_PATH, [
      "--headless",
      "--disable-gpu",
      "--no-sandbox",
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
    return { postId: post.id, success: false, images: [], error: "NOT_AN_INSTAGRAM_POST" };
  }

  if (!post.slides || post.slides.length !== 5) {
    return { postId: post.id, success: false, images: [], error: "INVALID_SLIDE_COUNT_MUST_BE_5" };
  }

  const postDir = path.join(baseOutputDir, post.id);
  const results: SlideImageMetadata[] = [];

  for (const slide of post.slides) {
    const filePath = path.join(postDir, `slide-${slide.position}.png`);
    const overflow = careerSlideOverflow(slide);

    try {
      const { sizeBytes } = await renderSlideToPng(slide, filePath);
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
        images: results,
        error: `Failed to render slide ${slide.position}: ${(err as Error).message}`,
      };
    }
  }

  return { postId: post.id, success: true, images: results };
}

/**
 * 既存のレンダリング済み画像メタデータを取得
 */
export function getExistingSlideImages(postId: string, baseOutputDir = OUTPUT_DIR): SlideImageMetadata[] {
  const postDir = path.join(baseOutputDir, postId);
  if (!fs.existsSync(postDir)) return [];

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
  return images;
}
