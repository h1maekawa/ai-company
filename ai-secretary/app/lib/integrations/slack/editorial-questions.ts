import type {
  AuthorViewpoint,
  EditorialAnswer,
  EditorialQuestion,
} from "./editorial-context";

export function editorialQuestions(input: {
  title: string;
  genreIds: string[];
}): EditorialQuestion[] {
  const investment = input.genreIds.some((id) => id === "asset-building") ||
    /株|投資|決算|半導体|市場|企業/.test(input.title);
  const ai = input.genreIds.includes("ai") || /AI|生成AI|LLM/.test(input.title);

  const questions: EditorialQuestion[] = [
    {
      id: "interest",
      category: "interest",
      question: "このニュースで、一番気になった会社・数字・出来事は何でしたか？",
      required: true,
    },
    investment
      ? {
          id: "opinion",
          category: "investment",
          question: "株価ではなく事業を見るなら、次に何を確認したいですか？",
          required: true,
        }
      : ai
        ? {
            id: "opinion",
            category: "opinion",
            question: "便利だと思った部分と、まだ微妙だと思う部分は何ですか？",
            required: true,
          }
        : {
            id: "opinion",
            category: "opinion",
            question: "この話を見て、今のところどう考えていますか？",
            required: true,
          },
    {
      id: "uncertainty",
      category: "uncertainty",
      question: "まだ分からないことや、もう少し追いかけたいことはありますか？",
      required: false,
    },
    {
      id: "experience",
      category: "experience",
      question: "自分が実際に経験したこととつながる部分はありますか？ なければ「ありません」で大丈夫です。",
      required: false,
    },
  ];
  return questions.slice(0, 4);
}

export function captureViewpoint(answers: EditorialAnswer[]): AuthorViewpoint {
  const byId = new Map(answers.map((answer) => [answer.questionId, answer.rawText.trim()]));
  const rawText = answers.map((answer) => answer.rawText.trim()).filter(Boolean).join("\n\n");
  const uncertainty = byId.get("uncertainty");
  const opinion = byId.get("opinion");
  const interest = byId.get("interest");
  const experience = byId.get("experience");

  return {
    rawText,
    mainOpinion: opinion || interest,
    reasons: interest && opinion ? [interest] : [],
    questions: uncertainty ? [uncertainty] : [],
    uncertainties: uncertainty ? [uncertainty] : [],
    experiences: experience && !/^(?:ありません|ない|特になし)$/.test(experience) ? [experience] : [],
    companiesToWatch: [],
    confirmedByUser: false,
    createdAt: new Date().toISOString(),
  };
}

export function viewpointSummary(viewpoint: AuthorViewpoint): string {
  return [
    "💭 今回のまえみちの考え",
    "",
    "私が受け取った内容は、こんな感じです。",
    "",
    `【一番気になったこと】\n${viewpoint.reasons[0] ?? viewpoint.mainOpinion ?? "まだ整理できていません"}`,
    "",
    `【今の考え】\n${viewpoint.mainOpinion ?? "まだ結論はありません"}`,
    "",
    `【まだ分からないこと】\n${viewpoint.uncertainties[0] ?? "特に挙げられていません"}`,
    "",
    "この理解で合っていますか？",
  ].join("\n");
}
