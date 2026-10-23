import type { CareerPost, CareerSlide } from "./types";

/**
 * Escaped, deterministic HTML for 4:5 carousel previews (1080x1350px).
 * Complete CSP protection, strictly local system fonts, zero external network assets.
 */
export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);

export type CarouselTemplateType = "qa" | "howto";

export function detectSlideTemplate(postOrSlide: { title?: string; headline?: string; body?: string }): CarouselTemplateType {
  const text = `${postOrSlide.title ?? ""} ${postOrSlide.headline ?? ""} ${postOrSlide.body ?? ""}`;
  if (/ステップ|STEP|Step|How|HOW|手順|5選|チェックリスト/iu.test(text)) {
    return "howto";
  }
  return "qa";
}

function estimatedLines(text: string, columns: number): number {
  return text.split("\n").reduce((sum, line) => sum + Math.max(1, Math.ceil(Array.from(line).length / columns)), 0);
}

export function careerSlideOverflow(slide: CareerSlide): boolean {
  // 1080x1350のスライドで読みやすさを維持するための文字数チェック
  return estimatedLines(slide.headline, 16) > 4 || estimatedLines(slide.body, 22) > 14;
}

export type RenderSlideOptions = {
  template?: CarouselTemplateType;
  total?: number;
  postTitle?: string;
};

/**
 * スライド1枚を 1080x1350px の高品位HTMLとしてレンダリング
 */
export function renderCareerCarouselSlide(
  slide: CareerSlide,
  totalOrOptions: number | RenderSlideOptions = 5
): string {
  const options: RenderSlideOptions =
    typeof totalOrOptions === "number" ? { total: totalOrOptions } : totalOrOptions;
  const total = options.total ?? 5;
  const template = options.template ?? detectSlideTemplate(slide);
  const pos = slide.position;

  const escapedHeadline = escapeHtml(slide.headline);
  const escapedBody = escapeHtml(slide.body);
  const coverHeadline = options.postTitle?.trim() || slide.headline;
  const escapedCoverHeadline = escapeHtml(coverHeadline);
  const howToCoverFontSize = Array.from(coverHeadline).length > 12 ? 54 : 68;
  const qaCoverFontSize = Array.from(coverHeadline).length > 12 ? 54 : 74;

  // 共通のベースCSS
  const baseCss = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: 1080px;
      height: 1350px;
      margin: 0;
      background: #F7F6F1;
      color: #1B2738;
      font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", sans-serif;
      -webkit-font-smoothing: antialiased;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 72px 64px 60px 64px;
      position: relative;
      overflow: hidden;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      width: 100%;
      height: 60px;
    }
    .brand-group {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .brand-badge {
      background: #152A48;
      color: #FFFFFF;
      font-size: 20px;
      font-weight: 700;
      letter-spacing: 0.08em;
      padding: 8px 18px;
      border-radius: 9999px;
    }
    .brand-sub {
      font-size: 19px;
      color: #5B6B7C;
      font-weight: 600;
      letter-spacing: 0.04em;
    }
    .page-indicator {
      background: #E8F1FA;
      color: #152A48;
      font-size: 22px;
      font-weight: 800;
      padding: 6px 18px;
      border-radius: 9999px;
      border: 1.5px solid #D0E3F7;
    }
    .main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 30px 0;
      width: 100%;
    }
    .footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      width: 100%;
      padding-top: 24px;
      border-top: 2px solid #E2E8F0;
      color: #5B6B7C;
      font-size: 21px;
      font-weight: 600;
    }
    .save-cta {
      display: flex;
      align-items: center;
      gap: 10px;
      background: #152A48;
      color: #FFFFFF;
      padding: 10px 22px;
      border-radius: 12px;
      font-size: 20px;
      font-weight: 700;
    }
    .save-icon {
      display: inline-block;
      width: 14px;
      height: 18px;
      border: 2.5px solid #F59E0B;
      border-bottom: none;
      position: relative;
    }
    .save-icon:after {
      content: "";
      position: absolute;
      bottom: -6px;
      left: -2.5px;
      border-left: 9px solid transparent;
      border-right: 9px solid transparent;
      border-top: 6px solid #152A48;
    }
  `;

  let slideContent = "";

  if (template === "howto") {
    // ------------------------------------
    // HOW-TO型 テンプレート
    // ------------------------------------
    if (pos === 1) {
      // 1枚目：大きな見出し・数字
      slideContent = `
        <div style="background: #FFFFFF; border-radius: 36px; padding: 70px 56px; border: 3px solid #E2E8F0; box-shadow: 0 16px 36px rgba(21,42,72,0.06); text-align: left;">
          <div style="display: inline-flex; align-items: center; gap: 12px; background: #FEF3C7; border: 2px solid #F59E0B; color: #B45309; padding: 8px 22px; border-radius: 9999px; font-size: 24px; font-weight: 800; margin-bottom: 32px;">
            <span>★</span><span>実践 HOW TO ガイド</span>
          </div>
          <div style="display: flex; align-items: baseline; gap: 18px; margin-bottom: 24px;">
            <span style="background: #152A48; color: #F59E0B; font-size: 96px; font-weight: 900; line-height: 1; padding: 12px 28px; border-radius: 24px; display: inline-block;">5</span>
            <span style="font-size: 44px; font-weight: 800; color: #152A48; letter-spacing: 0.05em;">STEP</span>
          </div>
          <h1 style="font-size: ${howToCoverFontSize}px; line-height: 1.28; font-weight: 900; color: #152A48; letter-spacing: -0.01em; margin-bottom: 36px;">
            ${escapedCoverHeadline}
          </h1>
          <div style="background: #E8F1FA; border-left: 8px solid #2563EB; padding: 24px 28px; border-radius: 0 20px 20px 0; font-size: 30px; line-height: 1.6; color: #1B2738; font-weight: 600;">
            ${escapedBody}
          </div>
          <div style="margin-top: 48px; display: flex; align-items: center; justify-content: flex-end; color: #2563EB; font-size: 26px; font-weight: 800;">
            ステップ順に確認する <span>➔</span>
          </div>
        </div>
      `;
    } else if (pos === 2) {
      // 2枚目：STEP 1
      slideContent = `
        <div style="background: #FFFFFF; border-radius: 36px; padding: 64px 52px; border: 2.5px solid #E2E8F0; box-shadow: 0 12px 32px rgba(21,42,72,0.05);">
          <div style="display: inline-block; background: #152A48; color: #FFFFFF; font-size: 26px; font-weight: 800; padding: 10px 24px; border-radius: 14px; margin-bottom: 28px;">
            STEP 01
          </div>
          <h2 style="font-size: 54px; font-weight: 850; line-height: 1.32; color: #152A48; margin-bottom: 36px;">
            ${escapedHeadline}
          </h2>
          <div style="background: #F8F9FA; border: 2px solid #E2E8F0; border-radius: 24px; padding: 36px 32px; font-size: 34px; line-height: 1.75; color: #1B2738; font-weight: 500; white-space: pre-wrap;">
            ${escapedBody}
          </div>
          <div style="margin-top: 36px; padding: 20px 24px; background: #FEF3C7; border-radius: 16px; border-left: 6px solid #F59E0B; font-size: 24px; color: #92400E; font-weight: 700;">
            💡 ポイント：最初から完璧を目指さず、まずは書き出すこと！
          </div>
        </div>
      `;
    } else if (pos === 3) {
      // 3枚目：STEP 2〜3
      const parts = splitStepContent(slide.body, 2);
      slideContent = `
        <div style="display: flex; flex-direction: column; gap: 28px;">
          <div style="background: #FFFFFF; border-radius: 28px; padding: 44px 44px; border: 2.5px solid #E2E8F0; box-shadow: 0 8px 24px rgba(21,42,72,0.04);">
            <div style="display: inline-block; background: #2563EB; color: #FFFFFF; font-size: 22px; font-weight: 800; padding: 6px 18px; border-radius: 10px; margin-bottom: 16px;">
              STEP 02
            </div>
            <h3 style="font-size: ${parts[0].headline.length > 26 ? 32 : 40}px; font-weight: 800; color: #152A48; line-height: 1.35; margin-bottom: 16px;">
              ${escapeHtml(parts[0].headline || escapedHeadline)}
            </h3>
            ${parts[0].body !== parts[0].headline ? `<p style="font-size: 28px; line-height: 1.7; color: #374151; white-space: pre-wrap;">${escapeHtml(parts[0].body)}</p>` : ""}
          </div>
          <div style="background: #FFFFFF; border-radius: 28px; padding: 44px 44px; border: 2.5px solid #E2E8F0; box-shadow: 0 8px 24px rgba(21,42,72,0.04);">
            <div style="display: inline-block; background: #152A48; color: #FFFFFF; font-size: 22px; font-weight: 800; padding: 6px 18px; border-radius: 10px; margin-bottom: 16px;">
              STEP 03
            </div>
            <h3 style="font-size: ${parts[1]?.headline.length > 26 ? 32 : 40}px; font-weight: 800; color: #152A48; line-height: 1.35; margin-bottom: 16px;">
              ${escapeHtml(parts[1]?.headline || "感情と工夫をセットで記録")}
            </h3>
            ${parts[1]?.body !== parts[1]?.headline ? `<p style="font-size: 28px; line-height: 1.7; color: #374151; white-space: pre-wrap;">${escapeHtml(parts[1]?.body || parts[0].body)}</p>` : ""}
          </div>
        </div>
      `;
    } else if (pos === 4) {
      // 4枚目：STEP 4〜5
      const parts = splitStepContent(slide.body, 4);
      slideContent = `
        <div style="display: flex; flex-direction: column; gap: 28px;">
          <div style="background: #FFFFFF; border-radius: 28px; padding: 44px 44px; border: 2.5px solid #E2E8F0; box-shadow: 0 8px 24px rgba(21,42,72,0.04);">
            <div style="display: inline-block; background: #152A48; color: #FFFFFF; font-size: 22px; font-weight: 800; padding: 6px 18px; border-radius: 10px; margin-bottom: 16px;">
              STEP 04
            </div>
            <h3 style="font-size: ${parts[0].headline.length > 26 ? 32 : 40}px; font-weight: 800; color: #152A48; line-height: 1.35; margin-bottom: 16px;">
              ${escapeHtml(parts[0].headline || escapedHeadline)}
            </h3>
            ${parts[0].body !== parts[0].headline ? `<p style="font-size: 28px; line-height: 1.7; color: #374151; white-space: pre-wrap;">${escapeHtml(parts[0].body)}</p>` : ""}
          </div>
          <div style="background: #FFFFFF; border-radius: 28px; padding: 44px 44px; border: 2.5px solid #E2E8F0; box-shadow: 0 8px 24px rgba(21,42,72,0.04);">
            <div style="display: inline-block; background: #F59E0B; color: #FFFFFF; font-size: 22px; font-weight: 800; padding: 6px 18px; border-radius: 10px; margin-bottom: 16px;">
              STEP 05
            </div>
            <h3 style="font-size: ${parts[1]?.headline.length > 26 ? 32 : 40}px; font-weight: 800; color: #152A48; line-height: 1.35; margin-bottom: 16px;">
              ${escapeHtml(parts[1]?.headline || "共通点を見出して言語化")}
            </h3>
            ${parts[1]?.body !== parts[1]?.headline ? `<p style="font-size: 28px; line-height: 1.7; color: #374151; white-space: pre-wrap;">${escapeHtml(parts[1]?.body || parts[0].body)}</p>` : ""}
          </div>
        </div>
      `;
    } else {
      // 5枚目：まとめ・保存CTA
      slideContent = `
        <div style="background: #FFFFFF; border-radius: 36px; padding: 56px 52px; border: 3px solid #152A48; box-shadow: 0 16px 36px rgba(21,42,72,0.08); text-align: center;">
          <div style="display: inline-block; background: #FEF3C7; border: 2px solid #F59E0B; color: #B45309; padding: 8px 24px; border-radius: 9999px; font-size: 22px; font-weight: 800; margin-bottom: 24px;">
            CHECK LIST
          </div>
          <h2 style="font-size: 52px; font-weight: 900; color: #152A48; margin-bottom: 32px; line-height: 1.3;">
            ${escapedHeadline}
          </h2>
          <div style="background: #F8F9FA; border-radius: 24px; padding: 32px 36px; text-align: left; margin-bottom: 36px; border: 2px solid #E2E8F0;">
            <div style="font-size: 30px; line-height: 1.8; color: #1B2738; white-space: pre-wrap;">${escapedBody}</div>
          </div>
          <div style="background: linear-gradient(135deg, #152A48, #2563EB); border-radius: 24px; padding: 36px 32px; color: #FFFFFF; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;">
            <div style="font-size: 34px; font-weight: 850; letter-spacing: 0.04em;">
              📌 後で見返せるように今すぐ保存
            </div>
            <div style="font-size: 22px; color: #E8F1FA;">
              右下のしおりボタンを押して、就活準備に役立てよう！
            </div>
          </div>
        </div>
      `;
    }
  } else {
    // ------------------------------------
    // Q&A型 テンプレート
    // ------------------------------------
    if (pos === 1) {
      // 1枚目：大きな質問
      slideContent = `
        <div style="background: #FFFFFF; border-radius: 36px; padding: 76px 56px; border: 3px solid #E2E8F0; box-shadow: 0 16px 40px rgba(21,42,72,0.06);">
          <div style="display: inline-flex; align-items: center; gap: 10px; background: #FEF3C7; border: 2px solid #F59E0B; color: #B45309; padding: 8px 22px; border-radius: 9999px; font-size: 24px; font-weight: 800; margin-bottom: 36px;">
            <span>？</span><span>就活初心者 Q&A</span>
          </div>
          <div style="color: #F59E0B; font-size: 80px; font-weight: 900; line-height: 1; margin-bottom: 12px;">Q.</div>
          <h1 style="font-size: ${qaCoverFontSize}px; line-height: 1.25; font-weight: 900; color: #152A48; letter-spacing: -0.02em; margin-bottom: 36px;">
            ${escapedCoverHeadline}
          </h1>
          <div style="background: #E8F1FA; border-left: 8px solid #2563EB; padding: 24px 28px; border-radius: 0 20px 20px 0; font-size: 32px; line-height: 1.6; color: #1B2738; font-weight: 600;">
            ${escapedBody}
          </div>
          <div style="margin-top: 52px; display: flex; align-items: center; justify-content: space-between;">
            <span style="font-size: 22px; color: #64748B; font-weight: 600;">今日からできる具体策を解説</span>
            <span style="color: #2563EB; font-size: 26px; font-weight: 800;">回答を見る ➔</span>
          </div>
        </div>
      `;
    } else if (pos === 2) {
      // 2枚目：結論
      slideContent = `
        <div style="background: #FFFFFF; border-radius: 36px; padding: 68px 52px; border: 2.5px solid #E2E8F0; box-shadow: 0 12px 32px rgba(21,42,72,0.05);">
          <div style="display: inline-block; background: #2563EB; color: #FFFFFF; font-size: 24px; font-weight: 800; padding: 8px 22px; border-radius: 12px; margin-bottom: 32px;">
            ${slide.headline.trim() === "課題" ? "課題 / 解決策" : "ANSWER / 結論"}
          </div>
          <h2 style="font-size: 54px; font-weight: 900; line-height: 1.32; color: #152A48; margin-bottom: 36px;">
            ${escapedHeadline}
          </h2>
          <div style="background: #E8F1FA; border: 3px solid #2563EB; border-radius: 28px; padding: 44px 36px; margin-bottom: 36px;">
            <p style="font-size: 38px; line-height: 1.65; color: #152A48; font-weight: 800; white-space: pre-wrap;">
              ${escapedBody}
            </p>
          </div>
          <p style="font-size: 26px; color: #475569; font-weight: 600; line-height: 1.6;">
            ※ 次のスライドで「なぜこのやり方が有効なのか」理由を解説します。
          </p>
        </div>
      `;
    } else if (pos === 3) {
      // 3枚目：理由
      slideContent = `
        <div style="background: #FFFFFF; border-radius: 36px; padding: 68px 52px; border: 2.5px solid #E2E8F0; box-shadow: 0 12px 32px rgba(21,42,72,0.05);">
          <div style="display: inline-block; background: #152A48; color: #FFFFFF; font-size: 24px; font-weight: 800; padding: 8px 22px; border-radius: 12px; margin-bottom: 32px;">
            REASON / 理由
          </div>
          <h2 style="font-size: 54px; font-weight: 900; line-height: 1.32; color: #152A48; margin-bottom: 36px;">
            ${escapedHeadline}
          </h2>
          <div style="background: #F8F9FA; border-radius: 24px; border: 2px solid #E2E8F0; padding: 40px 36px; font-size: 34px; line-height: 1.8; color: #1B2738; white-space: pre-wrap; font-weight: 500;">
            ${escapedBody}
          </div>
          <div style="margin-top: 36px; padding: 20px 24px; background: #E8F1FA; border-radius: 16px; border-left: 6px solid #2563EB; font-size: 24px; color: #1E40AF; font-weight: 700;">
            ✔ 学生がつまずきやすい原因を先回りして解消するのがポイント！
          </div>
        </div>
      `;
    } else if (pos === 4) {
      // 4枚目：具体例
      slideContent = `
        <div style="background: #FFFFFF; border-radius: 36px; padding: 64px 52px; border: 2.5px solid #E2E8F0; box-shadow: 0 12px 32px rgba(21,42,72,0.05);">
          <div style="display: inline-block; background: #F59E0B; color: #FFFFFF; font-size: 24px; font-weight: 800; padding: 8px 22px; border-radius: 12px; margin-bottom: 32px;">
            PRACTICE / 具体例
          </div>
          <h2 style="font-size: 52px; font-weight: 900; line-height: 1.32; color: #152A48; margin-bottom: 32px;">
            ${escapedHeadline}
          </h2>
          <div style="background: #F8F9FA; border-radius: 24px; border: 2px solid #E2E8F0; padding: 36px 32px; font-size: 32px; line-height: 1.8; color: #1B2738; white-space: pre-wrap;">
            ${escapedBody}
          </div>
          <p style="margin-top: 28px; font-size: 21px; color: #64748B;">
            ※ 具体例はわかりやすく整理した架空の説明例です。
          </p>
        </div>
      `;
    } else {
      // 5枚目：まとめ・保存CTA
      slideContent = `
        <div style="background: #FFFFFF; border-radius: 36px; padding: 56px 52px; border: 3px solid #152A48; box-shadow: 0 16px 36px rgba(21,42,72,0.08); text-align: center;">
          <div style="display: inline-block; background: #FEF3C7; border: 2px solid #F59E0B; color: #B45309; padding: 8px 24px; border-radius: 9999px; font-size: 22px; font-weight: 800; margin-bottom: 24px;">
            SUMMARY / まとめ
          </div>
          <h2 style="font-size: 52px; font-weight: 900; color: #152A48; margin-bottom: 32px; line-height: 1.3;">
            ${escapedHeadline}
          </h2>
          <div style="background: #F8F9FA; border-radius: 24px; padding: 32px 36px; text-align: left; margin-bottom: 36px; border: 2px solid #E2E8F0;">
            <div style="font-size: 30px; line-height: 1.8; color: #1B2738; white-space: pre-wrap;">${escapedBody}</div>
          </div>
          <div style="background: linear-gradient(135deg, #152A48, #2563EB); border-radius: 24px; padding: 36px 32px; color: #FFFFFF; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;">
            <div style="font-size: 34px; font-weight: 850; letter-spacing: 0.04em;">
              📌 後で見返せるように今すぐ保存
            </div>
            <div style="font-size: 22px; color: #E8F1FA;">
              右下のしおりボタンを押して、就活準備に役立てよう！
            </div>
          </div>
        </div>
      `;
    }
  }

  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <title>${escapedHeadline}</title>
  <style>${baseCss}</style>
</head>
<body>
  <header class="header">
    <div class="brand-group">
      <div class="brand-badge">就活攻略ラボ</div>
      <div class="brand-sub">就活初心者のためのES・面接対策</div>
    </div>
    <div class="page-indicator">${String(pos).padStart(2, "0")} / ${String(total).padStart(2, "0")}</div>
  </header>

  <main class="main-content">
    ${slideContent}
  </main>

  <footer class="footer">
    <span>Instagram ID 未確認</span>
    <div class="save-cta">
      <span class="save-icon"></span>
      <span>保存して見返す</span>
    </div>
  </footer>
</body>
</html>`;
}

function splitStepContent(text: string, baseStep: number): Array<{ headline: string; body: string }> {
  const clauses = text
    .split(/[\n／→。！？；;、]|\s+・/u)
    .map((part) => part.trim().replace(/^[「『①-⑤\s]+|[」』\s]+$/gu, ""))
    .filter(Boolean);
  const source = clauses.length >= 2 ? clauses : [text.trim()];
  const splitAt = Math.max(1, Math.ceil(source.length / 2));
  const groups = clauses.length >= 2
    ? [source.slice(0, splitAt), source.slice(splitAt)]
    : (() => {
        const characters = [...(text.trim() || `STEP 0${baseStep}を実行する`)];
        const midpoint = Math.ceil(characters.length / 2);
        return [characters.slice(0, midpoint).join(""), characters.slice(midpoint).join("")]
          .map((part) => [part.trim()]);
      })();
  const makePart = (parts: string[], index: number) => {
    const body = parts.join("／") || source.at(-1) || text.trim();
    const headline = body;
    return {
      headline: headline || `STEP 0${baseStep + index}を進める`,
      body,
    };
  };
  return [makePart(groups[0], 0), makePart(groups[1], 1)];
}

/**
 * 投稿全体のHTMLカルーセル配列を生成
 */
export function careerCarouselHtml(post: CareerPost): string[] {
  if (post.platform !== "instagram") return [];
  const template = detectSlideTemplate(post);
  return post.slides.map((slide) =>
    renderCareerCarouselSlide(slide, {
      template,
      total: post.slides.length,
      postTitle: post.title,
    })
  );
}
