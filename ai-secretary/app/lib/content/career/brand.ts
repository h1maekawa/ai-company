export const CAREER_BRAND = {
  name: "就活攻略ラボ",
  tagline: "就活初心者のためのES・面接対策",
  targetAudience: "就活初心者（主に大学生）",
  policy: "実践ノウハウ中心。初めて就活する学生が今日できる具体策を提示。",
  anonymityRule: "実名、勤務先、大学、顔、声、特定できる詳細体験は原則公開禁止。架空の説明例を明記。",
  prohibitedContent: "内定保証、根拠のない選考情報、虚偽の本人経験、他人の資料・画像の無断転載",
  colors: {
    primary: "#152A48",    // ネイビー
    background: "#F7F6F1", // アイボリー
    accent: "#4D83BD",     // ブルー
    text: "#1B2738",       // 文字
  },
  social: {
    x: {
      displayName: "就活攻略ラボ｜就活初心者のためのES・面接対策",
      bio: "就活初心者向けに、ES・自己分析・面接対策をわかりやすく解説。何から始めるか迷ったら、まずここから。今日できる就活の一歩を発信中📚",
      handleCandidate: "@shukatsu_koryaku",
      handleStatus: "UNCONFIRMED" as const,
      profileUrl: null as string | null,
      bufferChannelId: null as string | null,
      channelStatus: "UNCONFIRMED" as const,
    },
    instagram: {
      displayName: "就活攻略ラボ｜就活初心者向け",
      bio: "🎓 就活の「何から始める？」を解決／📝 ES・自己分析・面接の基本／💡 例文・チェックリストを発信／📌 保存して実践できる就活ノウハウ",
      handleCandidate: "@shukatsu.lab",
      handleStatus: "UNCONFIRMED" as const,
      profileUrl: null as string | null,
      bufferChannelId: null as string | null,
      channelStatus: "UNCONFIRMED" as const,
    },
  },
} as const;

export type CareerBrandConfig = typeof CAREER_BRAND;
