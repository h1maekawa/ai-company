import fs from "node:fs";
import path from "node:path";
import { CAREER_DIVISION_ID, type CareerBatch, type CareerKnowledgeItem, type CareerPost, type CareerSlide, type CareerSource, type CareerState } from "./types";
import { careerHash, careerId } from "./ids";
import { checkCareerFactuality, checkCareerPrivacy } from "./privacy";

export const WEEK1_START_DATE = "2026-10-26"; // 基準となる直近の月曜日

type RawWeek1Row = {
  day: string;
  platform: "x" | "instagram";
  title: string;
  body: string;
  caption: string;
  slides: string[];
  status: "draft" | "review";
};

const DEFAULT_WEEK1_ROWS: RawWeek1Row[] = [
  {
    day: "月",
    platform: "x",
    title: "自己分析の始め方",
    body: "就活を始めたばかりなら、最初から「将来やりたいこと」を完璧に決めなくてOK。まずは①頑張ったこと②楽しかったこと③苦手だったことを各3つ書き出してみよう。共通点を探すと、自分が大切にしている価値観のヒントが見つかります。今日の10分で十分。#就活初心者 #自己分析",
    caption: "",
    slides: [],
    status: "review",
  },
  {
    day: "月",
    platform: "instagram",
    title: "自己分析はこの5ステップで始めよう",
    body: "",
    caption: "自己分析は「すごい経験探し」ではありません。まず自分の行動と気持ちを振り返りましょう。保存して、今日10分だけ試してみてください。#自己分析 #就活初心者",
    slides: [
      "表紙：自己分析、何から始める？／まずは5ステップ",
      "課題：いきなり「強みは？」と聞かれると手が止まる／先に経験を思い出そう",
      "考え方：頑張った・楽しかった・嫌だった経験を各3つ書く／感情もメモする",
      "実践：1つ選んで「なぜ頑張れた？」「何を工夫した？」を3回掘り下げる",
      "まとめ：経験→感情→工夫→共通点／今日10分だけ書き出そう。保存して後で実践！",
    ],
    status: "review",
  },
  {
    day: "火",
    platform: "x",
    title: "ガクチカの組み立て方",
    body: "「ガクチカに書ける実績がない…」と悩んだら、結果の大きさより行動の中身を振り返ろう。①どんな課題があった？②何を考えた？③どんな工夫をした？④何を学んだ？ アルバイト、ゼミ、サークルなど身近な経験でも整理できます。#ガクチカ #ES対策",
    caption: "",
    slides: [],
    status: "review",
  },
  {
    day: "火",
    platform: "instagram",
    title: "ガクチカが書けない人のための型",
    body: "",
    caption: "ガクチカは特別な受賞歴だけを指しません。課題への向き合い方を具体化することが大切。例文は架空の説明例です。#ガクチカ #エントリーシート",
    slides: [
      "表紙：ガクチカは実績自慢じゃない／書き方の基本",
      "課題：「大会優勝」「売上1位」だけが題材と思い込む／身近な改善も題材になる",
      "考え方：状況→課題→行動→結果→学びの順に整理",
      "実践：例「忙しい時間帯に連携ミスが発生→共有方法を工夫→作業が進めやすくなった」※架空の説明例",
      "まとめ：結果より、自分の考えと行動を具体的に／保存して下書きを作ろう",
    ],
    status: "review",
  },
  {
    day: "水",
    platform: "x",
    title: "自己PRの作り方",
    body: "自己PRは「私の強みはコミュ力です」で終わらせないのがコツ。強みを一言で伝えたら、①それを示す経験②自分が取った行動③仕事でどう活かしたいか、までつなげよう。抽象的な強みより、行動が見える説明を意識。#自己PR #就活",
    caption: "",
    slides: [],
    status: "review",
  },
  {
    day: "水",
    platform: "instagram",
    title: "自己PRの基本構成4つ",
    body: "",
    caption: "自己PRは強みを並べるだけでは完成しません。「どんな場面で何をしたか」を入れて、あなたらしい文章に。#自己PR #ES",
    slides: [
      "表紙：自己PR、何を書けばいい？／基本構成4つ",
      "課題：「責任感があります」だけでは伝わりにくい／根拠となる行動が必要",
      "考え方：強み→経験→具体的行動→活かし方の順で組み立てる",
      "実践：例「私の強みは調整力です→意見が割れた場面で要望を整理し、共通案を提案した」※架空例",
      "まとめ：強みの名前より行動を説明／具体例を1つ選んで書こう",
    ],
    status: "review",
  },
  {
    day: "木",
    platform: "x",
    title: "志望動機の考え方",
    body: "志望動機で「成長できそうだから」だけを書くと、他社にも当てはまりがち。①興味を持ったきっかけ②その企業・仕事に惹かれる理由③自分がやりたいこと、をつなげてみよう。企業の公式情報を確認し、事実と自分の考えを分けるのも大切。#志望動機 #企業研究",
    caption: "",
    slides: [],
    status: "review",
  },
  {
    day: "木",
    platform: "instagram",
    title: "志望動機で見直したい3つのポイント",
    body: "",
    caption: "他の企業にも使える文章になっていないかチェックしましょう。企業情報は公式資料で確認し、推測を事実として書かないこと。#志望動機 #就活初心者",
    slides: [
      "表紙：志望動機がうまく書けない？／3つを確認",
      "課題：「理念に共感した」「成長できそう」だけでは理由が曖昧",
      "考え方：きっかけ・その企業ならではの理由・自分の希望を分ける",
      "実践：公式サイト等で事業・仕事内容を確認→興味との接点を一文にする",
      "まとめ：企業の特徴＋自分の理由をセットで／作成後は固有名詞を再確認",
    ],
    status: "review",
  },
  {
    day: "金",
    platform: "x",
    title: "面接回答の話し方",
    body: "面接で話が長くなりやすい人は「結論→理由→具体例→まとめ」の順番を試してみよう。質問に対する答えを最初の1文で伝えるだけでも、聞き手が理解しやすくなります。丸暗記より、自分の言葉で説明できる状態を目指そう。#面接対策 #就活",
    caption: "",
    slides: [],
    status: "review",
  },
  {
    day: "金",
    platform: "instagram",
    title: "面接で伝わりやすい話し方",
    body: "",
    caption: "面接は長く話すことより、質問に答えることが大切。最初の一文に結論を置いて練習しましょう。#面接対策 #就活",
    slides: [
      "表紙：面接で話がまとまらない人へ／4つの順番",
      "課題：背景から長く話し、結論が最後になる",
      "考え方：結論→理由→具体例→まとめ",
      "実践：「強みは計画力です→期限から逆算して準備した経験があります」から説明を始める※架空例",
      "まとめ：一問一答を録音せず文章で練習してもOK／まず30秒で説明してみよう",
    ],
    status: "review",
  },
  {
    day: "土",
    platform: "x",
    title: "逆質問",
    body: "面接の逆質問、何を聞けばいいか迷ったら「入社後の理解が深まる質問」を用意しよう。例：①配属後に最初に担当する仕事②活躍する人の共通点③入社前に学んでおくとよいこと。公式サイトに載っている内容は先に確認しておくと安心。#逆質問 #面接",
    caption: "",
    slides: [],
    status: "review",
  },
  {
    day: "土",
    platform: "instagram",
    title: "逆質問の例5選",
    body: "",
    caption: "逆質問は理解を深める機会。質問は企業・職種・面接段階に合わせて調整しましょう。#逆質問 #面接対策",
    slides: [
      "表紙：面接の逆質問に困ったら／使える5つの視点",
      "課題：「特にありません」で終わる前に／仕事内容への疑問を整理",
      "考え方：仕事内容・成長・チーム・期待役割・準備の5視点",
      "実践：例「入社後、最初に任される業務は？」「活躍する方の共通点は？」",
      "まとめ：相手の立場や面接段階に合う質問を2〜3個用意／保存して準備",
    ],
    status: "review",
  },
  {
    day: "日",
    platform: "x",
    title: "就活の週間準備",
    body: "就活が進まないと感じる日ほど、今週の行動を小さく整理しよう。①応募締切を確認②企業研究を1社③ESを1設問④面接の質問を1つ練習。全部を完璧にやる必要はありません。まずは続けられるペースで、来週の一歩を決めよう。#就活初心者 #就活準備",
    caption: "",
    slides: [],
    status: "review",
  },
  {
    day: "日",
    platform: "instagram",
    title: "日曜10分の就活チェックリスト",
    body: "",
    caption: "就活は一度に全部進めなくても大丈夫。来週の優先事項を3つ決めて、無理のない計画を作りましょう。#就活準備 #就活初心者",
    slides: [
      "表紙：来週の就活、日曜10分で整えよう",
      "課題：やることが多すぎて手を付けられない",
      "考え方：締切・企業研究・ES・面接練習の4項目に分ける",
      "実践：今週は「企業を1社調べる」「ESを1設問書く」など小さく設定",
      "まとめ：予定を詰めすぎず、優先順位を3つ選ぶ／保存して毎週見返そう",
    ],
    status: "review",
  },
];

function parseSlide(rawText: string, position: number): CareerSlide {
  // e.g. "表紙：自己分析、何から始める？／まずは5ステップ"
  const parts = rawText.split(/[：:]/u);
  if (parts.length >= 2) {
    const headline = parts[0].trim();
    const body = parts.slice(1).join("：").trim();
    return { position, headline, body };
  }
  return { position, headline: `Slide ${position}`, body: rawText.trim() };
}

export function seedWeek1Batch(state: CareerState, weekStartDate = WEEK1_START_DATE, now = new Date()): { batch: CareerBatch; posts: CareerPost[]; source: CareerSource; items: CareerKnowledgeItem[] } {
  // 既に初週バッチが存在する場合は既存のものを返す（重複防止）
  const existingBatch = state.batches.find((b) => b.weekStartDate === weekStartDate && b.divisionId === CAREER_DIVISION_ID);
  if (existingBatch) {
    const existingPosts = existingBatch.postIds.map((id) => state.posts.find((p) => p.id === id)).filter((p): p is CareerPost => Boolean(p));
    const source = state.sources.find((s) => s.divisionId === CAREER_DIVISION_ID) ?? {
      id: "career-source-seed",
      divisionId: CAREER_DIVISION_ID,
      sourceType: "note",
      privateUri: "local:memory/personal/career/career-state.json",
      contentHash: "existing",
      language: "ja",
      ingestedAt: now.toISOString(),
      retentionPolicy: "private_until_human_deletion",
      processingStatus: "processed",
      error: null,
    };
    return { batch: existingBatch, posts: existingPosts, source, items: state.knowledgeItems.filter((k) => k.divisionId === CAREER_DIVISION_ID) };
  }

  const at = now.toISOString();
  const sourceDigest = careerHash(JSON.stringify(DEFAULT_WEEK1_ROWS));
  const source: CareerSource = {
    id: careerId("career_source"),
    divisionId: CAREER_DIVISION_ID,
    sourceType: "note",
    privateUri: "local:shukatsu_lab_ready_v1/03_week1_posts.csv",
    contentHash: sourceDigest,
    language: "ja",
    ingestedAt: at,
    retentionPolicy: "private_until_human_deletion",
    processingStatus: "processed",
    error: null,
  };

  const dayIndexMap: Record<string, number> = { 月: 0, 火: 1, 水: 2, 木: 3, 金: 4, 土: 5, 日: 6 };
  const topicMap: Record<string, string> = {
    月: "自己分析",
    火: "ガクチカ",
    水: "自己PR",
    木: "志望動機",
    金: "面接対策",
    土: "逆質問",
    日: "週間準備",
  };

  // 7テーマ分のナレッジアイテムを作成
  const items: CareerKnowledgeItem[] = Object.entries(topicMap).map(([day, topic]) => {
    const xRow = DEFAULT_WEEK1_ROWS.find((r) => r.day === day && r.platform === "x");
    const summary = xRow ? xRow.body.slice(0, 100) : `${topic}の基本ノウハウ`;
    const fullBody = xRow ? xRow.body : `${topic}に関する実践ノウハウです。`;
    const privacy = checkCareerPrivacy(fullBody);
    return {
      id: careerId("career_knowledge"),
      divisionId: CAREER_DIVISION_ID,
      sourceId: source.id,
      title: `${topic}の実践ノウハウ`,
      summary,
      bodyPrivate: fullBody,
      topic,
      audience: "就活初心者",
      evidenceType: "general_advice",
      privacyRisk: privacy.risk,
      verificationStatus: "human_verified",
      createdAt: at,
      updatedAt: at,
    };
  });

  const batchId = careerId("career_batch");
  const posts: CareerPost[] = [];

  for (const row of DEFAULT_WEEK1_ROWS) {
    const dayOffset = dayIndexMap[row.day] ?? 0;
    const schedule = new Date(`${weekStartDate}T19:00:00+09:00`);
    schedule.setDate(schedule.getDate() + dayOffset);

    const topic = topicMap[row.day] ?? "就活";
    const knowledgeItem = items.find((k) => k.topic === topic) ?? items[0];

    const slides: CareerSlide[] = row.platform === "instagram"
      ? row.slides.map((s, idx) => parseSlide(s, idx + 1))
      : [];

    const fullContent = row.platform === "x"
      ? row.body
      : `${row.caption}\n${slides.map((s) => `${s.headline}\n${s.body}`).join("\n")}`;

    const privacy = checkCareerPrivacy(fullContent);
    const factuality = checkCareerFactuality(fullContent);

    const post: CareerPost = {
      id: careerId("career_post"),
      divisionId: CAREER_DIVISION_ID,
      batchId,
      knowledgeItemId: knowledgeItem.id,
      platform: row.platform,
      scheduledAt: schedule.toISOString(),
      title: row.title,
      body: row.platform === "x" ? row.body : "",
      caption: row.platform === "instagram" ? row.caption : "",
      slides,
      status: "review", // 初回は人間確認待ちのレビュー状態
      anonymityCheck: privacy.risk,
      factualityCheck: factuality,
      sponsorshipFlag: false,
      approvedBy: null,
      approvedAt: null,
      contentHash: careerHash(fullContent),
      createdAt: at,
      updatedAt: at,
    };
    posts.push(post);
  }

  const batch: CareerBatch = {
    id: batchId,
    divisionId: CAREER_DIVISION_ID,
    weekStartDate,
    timezone: "Asia/Tokyo",
    generationModel: "local-template-v1",
    promptVersion: "career-v1",
    status: "review",
    generatedAt: at,
    approvedAt: null,
    postIds: posts.map((p) => p.id),
  };

  return { batch, posts, source, items };
}
