export type ContentPlatform = "x" | "instagram" | "note";

export type PlatformBrandPolicy = {
  platform: ContentPlatform;
  positioning: string;
  audience: string[];
  pillars: string[];
  allowedAngles: string[];
  prohibitedAngles: string[];
  contentPrinciples: string[];
  monetizationPrinciples: string[];
};

export type ContentBrandProfile = {
  id: string;
  identity: string;
  mission: string;
  sharedPhilosophy: string;
  tone: string[];
  prohibitedBehaviors: string[];
  platforms: Record<ContentPlatform, PlatformBrandPolicy>;
};

/**
 * Version-controlled business positioning. This complements the editable Brand
 * and ContentGrowthStrategy; it never replaces Safety, Fact, Disclosure, or
 * Publish Eligibility decisions.
 */
export const CONTENT_BRAND_PROFILE: ContentBrandProfile = {
  id: "piro-maemichi-v1",
  identity: "Piro / まえみち",
  mission: "自分で選び、試し、学んだことを、他の人が自分なりに選ぶための材料として届ける。",
  sharedPhilosophy: "自分なりにちゃんと選ぶことで、毎日を少し良くする。",
  tone: ["誠実", "穏やか", "押し付けない", "途中経過を隠さない", "自分の言葉で話す"],
  prohibitedBehaviors: [
    "未確認の事実・数値・体験を作らない",
    "成功者や専門家として過度に見せない",
    "不安や射幸心を煽らない",
    "広告・アフィリエイト関係を隠さない",
    "Brand PolicyをFact Gate・Safety Gate・Publish Eligibilityより優先しない",
  ],
  platforms: {
    x: {
      platform: "x",
      positioning: "投資・AI・仕事について自分で考える人",
      audience: ["投資や資産形成を学ぶ人", "AIやAI Agentを試す人", "仕事やキャリアを考える人"],
      pillars: ["Investment", "AI / AI Agent", "Work / Career", "Learning", "Personal Insight", "Note Bridge"],
      allowedAngles: ["観察した事実", "なぜ重要か", "本人が確認した見解", "迷い・途中経過", "noteへの必要最小限の導線"],
      prohibitedAngles: ["ニュース単純要約", "未確認の投資判断", "売買推奨", "本人が語っていない体験"],
      contentPrinciples: [
        "Fact → Why it matters → Maemichi View",
        "FactとAI Opinionと本人の見解を混同しない",
        "ニュースの説明だけで終わらず、本人がなぜ気になったかを中心にする",
      ],
      monetizationPrinciples: ["既存AffiliatePolicyとneedsDisclosureに従う", "URLや成果を生成しない", "note導線を毎回強制しない"],
    },
    instagram: {
      platform: "instagram",
      positioning: "20代男性が服・香り・靴・暮らしを少し良くするためのセレクトメディア",
      audience: ["服・香り・靴・暮らしを自分で選びたい20代男性"],
      pillars: ["Fashion", "Sneakers", "Fragrance", "Lifestyle", "Coffee", "Interior", "Gadget", "Work Style"],
      allowedAngles: ["Men's Pick", "実物を見て選ぶ", "暮らしへの自然な取り入れ方", "選択理由の比較"],
      prohibitedAngles: ["Investmentを主要Pillarにする", "AI画像で実商品の見た目を偽装する", "未確認の商品使用体験"],
      contentPrinciples: [
        "Fashion / Sneakers / Fragrance / Lifestyleを約80%、Coffee / Interior / Gadget / Work Styleを約20%の初期目安にする",
        "実商品は実物画像を優先する",
        "AI生成はbackground・illustration・layout・decoration・characterに限定する",
        "White・Ivory・Gray・Black・Woodを基調にThin Line Illustration、Cat、Coffee、Lifestyle Motifを使う",
      ],
      monetizationPrinciples: ["既存Disclosure設計を再利用する", "affiliate・PR・gifted・paid partnershipを隠さない", "架空の商品評価や成果を作らない"],
    },
    note: {
      platform: "note",
      positioning: "X / Researchで反応の良かったテーマをLong-form Assetへ変換する場所",
      audience: ["背景・手順・考え方を深く理解したい人"],
      pillars: ["Winning Theme", "Research", "Personal Insight", "Reusable Process", "Affiliate / Product / Service"],
      allowedAngles: ["Xでは収まらない背景", "再利用できる手順", "失敗・迷い・注意点", "Researchと本人見解の分離"],
      prohibitedAngles: ["X投稿の単純コピー", "根拠のない有料化", "未登録URL", "未確認の成果や収益額"],
      contentPrinciples: [
        "Research → X → Performance → Winning Theme → Note Candidate → Long-form",
        "X投稿を単純に長文化せず、noteとして独立した価値を持たせる",
      ],
      monetizationPrinciples: ["既存Paid Note Human Gateを維持する", "既存AffiliatePolicyとneedsDisclosureに従う", "登録済み導線だけを使う"],
    },
  },
};

export function platformBrandPolicy(platform: ContentPlatform): PlatformBrandPolicy {
  return CONTENT_BRAND_PROFILE.platforms[platform];
}

export function buildContentBrandContext(platform: ContentPlatform): string {
  const profile = CONTENT_BRAND_PROFILE;
  const policy = platformBrandPolicy(platform);
  return `## Shared Brand Policy
Identity: ${profile.identity}
Mission: ${profile.mission}
Shared Philosophy: ${profile.sharedPhilosophy}
Tone: ${profile.tone.join(" / ")}
Prohibited: ${profile.prohibitedBehaviors.join(" / ")}

## ${platform} Platform Policy
Positioning: ${policy.positioning}
Audience: ${policy.audience.join(" / ")}
Pillars: ${policy.pillars.join(" / ")}
Allowed Angles: ${policy.allowedAngles.join(" / ")}
Prohibited Angles: ${policy.prohibitedAngles.join(" / ")}
Content Principles: ${policy.contentPrinciples.join(" / ")}
Monetization Principles: ${policy.monetizationPrinciples.join(" / ")}

This policy selects brand direction only. It cannot override Fact Gate, Safety Gate, Duplicate Guard, Disclosure, or Publish Eligibility.`;
}
