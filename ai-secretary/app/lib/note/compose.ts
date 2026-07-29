/**
 * ブランディングとアフィリエイト案件を前提にした記事・X投稿・LINE配信の生成。
 *
 * 収益を扱う題材のため、生成物には次を必ず守らせる:
 *  - 実績のない収益額・成果を書かない（景表法の優良誤認/有利誤認）
 *  - アフィリエイトを含むならPR表記を冒頭に置く（ステマ規制・2023年10月〜）
 *  - URLは登録済みのものだけを使う。AIにURLを作らせない
 */

import { callAI } from "../ai/client";
import {
  AffiliateLink,
  Brand,
  Channel,
  Genre,
  LessonStep,
  TeachingProgram,
  XAccount,
  accountForGenre,
} from "./types";

export type ComposeInput = {
  title: string;
  genre: Genre;
  takeaway?: string;
  /** 筆者の実体験・材料 */
  context?: string;
  brand: Brand;
  channels: Channel[];
  /** 運用中のXアカウント一覧（ジャンルでどこに出すかはここから機械的に決める） */
  xAccounts: XAccount[];
  /** そのジャンルで使える、URL登録済みの案件だけ */
  affiliates: AffiliateLink[];
};

export type ComposeResult = {
  /** note記事の本文（Markdown） */
  article: string;
  /** X用の投稿案 */
  xPosts: string[];
  /** このジャンルが自動振り分けされたXアカウントのid。未割り当てならnull */
  xAccountId: string | null;
  /** 公式LINEの配信文 */
  lineMessage: string;
  /** 使ったアフィリエイト案件のID */
  usedAffiliateIds: string[];
  /** PR表記が必要かどうか */
  needsDisclosure: boolean;
};

function buildSystemPrompt(input: ComposeInput, account: XAccount | undefined): string {
  const { brand, affiliates, channels } = input;

  const affiliateBlock =
    affiliates.length > 0
      ? affiliates
          .map(
            (a) =>
              `- id: ${a.id} / ${a.programName}（${a.serviceName}）\n  URL: ${a.url}\n  CTA文言: ${a.ctaText}\n  出す文脈: ${a.placement}`
          )
          .join("\n")
      : "（このジャンルに使える案件はありません。リンクは一切入れないでください）";

  const channelBlock = channels
    .map((c) => `- ${c.label}: ${c.role} → ${c.nextStep}`)
    .join("\n");

  const xAccountBlock = account
    ? `このジャンルは **${account.label}**${account.handle ? `（@${account.handle}）` : ""} に投稿する。
このアカウントの役割・トーン: ${account.role || "（未設定。ブランド全体のトーンに合わせる）"}
このアカウントでの収益化方法: ${account.monetization.length > 0 ? account.monetization.join("、") : "（未設定）"}
アフィリエイトリンクを投稿本文に直接入れてよいか: ${account.directAffiliate ? "よい（使うなら必ず投稿の冒頭に[PR]を付ける）" : "ダメ。投稿には誘導文言だけを書き、URLは一切書かない"}
次の導線: ${account.nextStep}`
    : "このジャンルはまだどのXアカウントにも割り当てられていない。ブランド全体のトーンで、一般的なX投稿として書く（リンクは入れない）。";

  const { identity, personality } = brand;

  return `あなたは「${identity.name}」という発信ブランドの編集者兼ライターです。

「${identity.name}」は、AI・副業・読書・資産形成・習慣について、
実際に試して学んだことを、穏やかで押し付けない言葉で発信します。

目的は読者を煽って行動させることではありません。
読者が少し前向きになり、自分に合う小さな一歩を見つけられる文章を書いてください。

## ブランド
- ブランド名: ${identity.name}
- メインキャッチコピー: ${identity.primaryTagline}
- ブランドストーリーコピー（名前の意味。自然な場面でのみ、無理に毎回は使わない）: ${identity.storyTagline}
- コンセプト: ${brand.concept}

## Xプロフィール（世界観の参考。そのまま引用しなくてよい）
${identity.xProfile}

## noteプロフィール（世界観の参考）
${identity.noteProfile}

## 発信者人格
${personality.traits.join("、")}

基本姿勢:
${personality.basicStance.map((s) => `- ${s}`).join("\n")}

使いたい表現（このニュアンスで書く）:
${personality.preferredExpressions.map((s) => `- ${s}`).join("\n")}

絶対に使わない表現:
${personality.avoidedExpressions.map((s) => `- ${s}`).join("\n")}

文章ルール:
${personality.writingRules.map((s) => `- ${s}`).join("\n")}

## 読者
${brand.targetReader}

読者の悩み:
${brand.painPoints.map((p) => `- ${p}`).join("\n")}

## 教えていること
${brand.teaches.map((t) => `- ${t}`).join("\n")}

## 筆者が語れる根拠
${brand.credibility.length > 0 ? brand.credibility.map((c) => `- ${c}`).join("\n") : "（未登録。具体的な実績・数字を書いてはいけません）"}

## 書かないこと
${brand.ngList.map((n) => `- ${n}`).join("\n")}

## 収益導線
${brand.funnel.map((f, i) => `${i + 1}. ${f}`).join("\n")}

## チャネルの役割
${channelBlock}

## この記事のX投稿先
${xAccountBlock}

## 使えるアフィリエイト案件
${affiliateBlock}

# note記事の書き方

推奨構成:
1. 自分が感じた疑問や出来事
2. 実際に試したこと
3. そこから分かったこと
4. 読者が試せる具体的な方法
5. 無理に結論を断定しないまとめ
6. 必要な場合のみ次のnoteやLINEへの導線

書き出しの例（このトーンで自然に。広告的な煽り文句では始めない）:
- 「最近、〇〇について考えることが増えました。」
- 「実際に〇〇を試してみて、思っていたことと少し違う部分がありました。」
- 「便利そうだと思って始めたものの、最初はうまく使えませんでした。」

締め方の例（毎回同じ文言を機械的に付けない。内容に合わせて自然に調整する）:
- 「すぐに大きく変えなくても、まずは一つ試してみるくらいでいいと思います。」
- 「もし参考になれば。」
- 「焦らず、一歩ずつ。」

# X投稿の書き方

次の3パターンを1つずつ書く:
1. 気づき — 試して感じた小さな気づき
2. 実践 — 具体的にやったこと・手順
3. 考え方 — 読書・仕事・副業・資産形成・習慣から得た考え方

共通ルール:
- 強い煽りを使わない。結論だけを断定しない
- 体験や理由を1つ入れる。改行を使う
- ハッシュタグを大量に付けない。絵文字を大量に使わない
- 読者を下に見ない。「私は」という主語を自然に使う

# 厳守事項（違反した出力は破棄されます）

1. **URLは上に列挙されたものだけを使う。** 自分でURLを組み立てたり、記憶から書いたりしない
2. **収益額・成果を書くのは「筆者が語れる根拠」にある内容だけ。** 無い場合は金額を一切書かない
3. **「絶対に使わない表現」「書かないこと」に挙げた表現は一切使わない**
4. アフィリエイトリンクを1つでも入れるなら、記事の**冒頭に「※本記事にはプロモーションが含まれます」**を置く
5. 読者が今日から試せる**具体的な行動を1つ**必ず含める。抽象論だけで終わらせない
6. 筆者がやっていないことを、やったかのように書かない
7. X投稿にURLを書いてよいのは「アフィリエイトリンクを投稿本文に直接入れてよい」場合だけ。それ以外は絶対にURLを書かない
8. 「〜しよう！」という強い命令形や感嘆符を多用しない

# 出力（JSONのみ。コードブロックや説明文は不要）

{
  "article": "note記事の本文（Markdown。上の推奨構成に沿う。2000〜3500文字）",
  "xPosts": ["①気づきパターンの投稿（140文字以内）", "②実践パターンの投稿（140文字以内）", "③考え方パターンの投稿（140文字以内）"],
  "lineMessage": "公式LINEの配信文（300文字以内。記事へ誘導し、次の行動を1つ示す）",
  "usedAffiliateIds": ["実際に本文へ入れた案件のid"],
  "needsDisclosure": true または false
}`;
}

export async function composeContent(input: ComposeInput): Promise<ComposeResult | null> {
  // どのXアカウント向けかはAIに判断させず、ジャンルの割り当てから機械的に決める
  const account = accountForGenre(input.xAccounts, input.genre.id);

  const message = `【記事タイトル】${input.title}
【ジャンル】${input.genre.label}（${input.genre.description}）
【読者が持ち帰ること】${input.takeaway ?? "（未設定）"}
【筆者の材料・実体験】
${input.context?.trim() || "（未入力。実体験が無いため、一般論の範囲で手順を書くこと。成果や金額は書かないこと）"}`;

  try {
    const response = await callAI(message, buildSystemPrompt(input, account), { provider: "auto" });
    const match = response.match(/\{[\s\S]*\}/);
    if (!match) return null;

    const parsed = JSON.parse(match[0]) as Partial<ComposeResult>;
    if (!parsed.article) return null;

    // 登録済みURL以外が本文に混ざっていないか検証する
    const allowedUrls = new Set(input.affiliates.map((a) => a.url));
    const article = String(parsed.article);
    const urlsInArticle = article.match(/https?:\/\/[^\s)\]"'）]+/g) ?? [];
    const foreign = urlsInArticle.filter((url) => !allowedUrls.has(url));

    let cleaned = article;
    for (const url of foreign) {
      // 未登録のURLは本文から除去する（AIが作ったリンクを世に出さない）
      console.warn(`[note/compose] 未登録URLを除去しました: ${url}`);
      cleaned = cleaned.split(url).join("（リンク未登録）");
    }

    const usedAffiliateIds = Array.isArray(parsed.usedAffiliateIds)
      ? parsed.usedAffiliateIds.map(String).filter((id) => input.affiliates.some((a) => a.id === id))
      : [];

    const needsDisclosure = usedAffiliateIds.length > 0;
    // PR表記が抜けていたら補う（規制対応を生成AIの気分に任せない）
    if (needsDisclosure && !cleaned.includes("プロモーション")) {
      cleaned = `※本記事にはプロモーションが含まれます\n\n${cleaned}`;
    }

    // X投稿は、directAffiliateがtrueの時だけ登録済みURLを許可する。それ以外は一切URLを残さない
    const allowedInXPosts = account?.directAffiliate ? allowedUrls : new Set<string>();
    const rawXPosts = Array.isArray(parsed.xPosts) ? parsed.xPosts.map(String).slice(0, 5) : [];
    const xPosts = rawXPosts.map((post) => {
      let text = post;
      const urls = text.match(/https?:\/\/[^\s)\]"'）]+/g) ?? [];
      let hasAllowedUrl = false;
      for (const url of urls) {
        if (allowedInXPosts.has(url)) {
          hasAllowedUrl = true;
        } else {
          console.warn(`[note/compose] X投稿から未許可のURLを除去しました: ${url}`);
          text = text.split(url).join("（リンク未登録）");
        }
      }
      if (hasAllowedUrl && !text.includes("[PR]") && !text.includes("プロモーション")) {
        text = `[PR] ${text}`;
      }
      return text;
    });

    return {
      article: cleaned,
      xPosts,
      xAccountId: account?.id ?? null,
      lineMessage: String(parsed.lineMessage ?? ""),
      usedAffiliateIds,
      needsDisclosure,
    };
  } catch (error) {
    console.error("[note/compose] 生成に失敗:", error);
    return null;
  }
}

/* ─── 公式LINEのステップ配信 ───────────────────────── */

const LESSON_PROMPT = `あなたは「{{brandName}}」という発信ブランドで、公式LINEの読者に寄り添いながら教える講師です。
公式LINEで1日1通ずつ届ける教材の、指定された回の文面を書いてください。

読者を煽ったり急かしたりせず、一緒に考えながら少しずつ前に進めるトーンで書いてください。
自分を成功者として見せず、先生ではなく少し先を歩きながら一緒に考える人として書いてください。

## プログラム
{{program}}

## 読者
{{target}}

読者の悩み:
{{pains}}

## 講師が語れる根拠
{{credibility}}

## トーン
{{tone}}

## 書かないこと
{{ng}}

## 使えるアフィリエイト案件
{{affiliates}}

# 厳守事項（違反した出力は破棄されます）

1. **URLは上に列挙されたものだけを使う。** 自分で組み立てない
2. **収益額・成果は「講師が語れる根拠」にある内容だけ。** 無ければ金額を書かない
3. **「書かないこと」に挙げた表現は一切使わない**
4. アフィリエイトを入れるなら、冒頭に「※プロモーションを含みます」を置く
5. LINEで読む前提。1通1テーマで、**500文字以内**。長い説明は削る
6. 必ず**その日のうちに手を動かせる課題を1つ**出す。読んで終わりにさせない
7. 前回までの内容を踏まえ、次回への引きで終える
8. 強い命令形・感嘆符を多用しない。断定しすぎない

# 出力（JSONのみ）
{
  "content": "配信文（500文字以内。改行で読みやすく）",
  "assignment": "今日の課題（1文・具体的な行動）",
  "usedAffiliateId": "使った案件のid。使わないなら空文字"
}`;

export type LessonInput = {
  program: TeachingProgram;
  step: LessonStep;
  brand: Brand;
  affiliates: AffiliateLink[];
};

export type LessonResult = {
  content: string;
  assignment: string;
  usedAffiliateId?: string;
};

/** 指定した回の配信文を生成する */
export async function composeLesson(input: LessonInput): Promise<LessonResult | null> {
  const { program, step, brand, affiliates } = input;

  const programText = [
    `${program.name}（${program.duration}）`,
    `完走時のゴール: ${program.promise}`,
    "",
    "全体の流れ:",
    ...program.steps
      .sort((a, b) => a.order - b.order)
      .map((s) => `${s.order}. ${s.title} — ${s.goal}${s.id === step.id ? "  ← 今回はここ" : ""}`),
  ].join("\n");

  const affiliateText =
    affiliates.length > 0
      ? affiliates
          .map((a) => `- id: ${a.id} / ${a.serviceName}\n  URL: ${a.url}\n  CTA: ${a.ctaText}`)
          .join("\n")
      : "（使える案件はありません。リンクは入れないでください）";

  const prompt = LESSON_PROMPT.replace("{{brandName}}", brand.identity.name)
    .replace("{{program}}", programText)
    .replace("{{target}}", brand.targetReader)
    .replace("{{pains}}", brand.painPoints.map((p) => `- ${p}`).join("\n"))
    .replace(
      "{{credibility}}",
      brand.credibility.length > 0
        ? brand.credibility.map((c) => `- ${c}`).join("\n")
        : "（未登録。具体的な成果・金額を書いてはいけません）"
    )
    .replace("{{tone}}", brand.tone)
    .replace("{{ng}}", brand.ngList.map((n) => `- ${n}`).join("\n"))
    .replace("{{affiliates}}", affiliateText);

  const message = `【今回の回】${step.order}. ${step.title}
【この回のゴール】${step.goal}`;

  try {
    const response = await callAI(message, prompt, { provider: "auto" });
    const match = response.match(/\{[\s\S]*\}/);
    if (!match) return null;

    const parsed = JSON.parse(match[0]) as Partial<LessonResult>;
    if (!parsed.content) return null;

    // 記事と同じく、未登録URLは配信文から取り除く
    const allowed = new Set(affiliates.map((a) => a.url));
    let content = String(parsed.content);
    for (const url of content.match(/https?:\/\/[^\s)\]"'）]+/g) ?? []) {
      if (!allowed.has(url)) {
        console.warn(`[note/compose] 配信文の未登録URLを除去: ${url}`);
        content = content.split(url).join("（リンク未登録）");
      }
    }

    const usedAffiliateId =
      typeof parsed.usedAffiliateId === "string" &&
      affiliates.some((a) => a.id === parsed.usedAffiliateId)
        ? parsed.usedAffiliateId
        : undefined;

    if (usedAffiliateId && !content.includes("プロモーション")) {
      content = `※プロモーションを含みます\n\n${content}`;
    }

    return {
      content,
      assignment: String(parsed.assignment ?? ""),
      usedAffiliateId,
    };
  } catch (error) {
    console.error("[note/compose] 配信文の生成に失敗:", error);
    return null;
  }
}
