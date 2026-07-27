import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // AI投資パートナーのカラースキーム
        ink: {
          base: "#0B1220", // 背景
          card: "#111827", // カード
          raised: "#161F32", // ホバー・入れ子カード
        },
        brand: {
          DEFAULT: "#4F8CFF", // メインカラー
          soft: "rgba(79,140,255,0.12)",
        },
        gain: "#22C55E", // 利益
        loss: "#EF4444", // 損失
        sub: "#94A3B8", // サブテキスト
        hairline: "rgba(255,255,255,0.08)", // ボーダー
      },
      borderColor: {
        DEFAULT: "rgba(255,255,255,0.08)",
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.24), 0 8px 24px -12px rgba(0,0,0,0.6)",
        lift: "0 2px 6px rgba(0,0,0,0.3), 0 16px 40px -16px rgba(0,0,0,0.7)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.35s ease-out both",
        shimmer: "shimmer 1.6s infinite",
      },
    },
  },
  plugins: [],
};
export default config;
