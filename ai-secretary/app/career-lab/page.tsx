import type { Metadata } from "next";
import { careerSocialLinks } from "@/app/lib/content/career/publicLinks";
import styles from "./page.module.css";

const title = "就活ラボ｜AIで、就活をもっと戦略的に。";
const description = "ES・面接・自己分析・企業研究に役立つ実践ヒント。AIを活用しながら、自分の言葉で就活を進めるための情報を発信します。";

export function generateMetadata(): Metadata {
  const base = process.env.CAREER_LAB_BASE_URL;
  const siteUrl = base && /^https:\/\/[^/?#]+\/?$/.test(base) ? new URL(base) : null;
  const imageUrl = siteUrl ? new URL("/career-lab-og.svg", siteUrl).toString() : null;
  return {
    title,
    description,
    robots: { index: false, follow: false },
    ...(siteUrl ? { metadataBase: siteUrl } : {}),
    openGraph: { title, description, locale: "ja_JP", type: "website", ...(imageUrl ? { images: [{ url: imageUrl, width: 1200, height: 630, alt: "就活ラボ" }] } : {}) },
    twitter: { card: imageUrl ? "summary_large_image" : "summary", title, description, ...(imageUrl ? { images: [imageUrl] } : {}) },
  };
}

export default function CareerLabPage() {
  const links = careerSocialLinks({ instagram: process.env.CAREER_LAB_INSTAGRAM_URL, x: process.env.CAREER_LAB_X_URL });
  return <div className={styles.page}>
    <header className={`${styles.wrap} ${styles.nav}`}><div className={styles.logo}>就活<span>ラボ</span></div><span className={styles.tag}>就活に役立つ実践ヒント</span></header>
    <main>
      <section className={`${styles.wrap} ${styles.hero}`} aria-labelledby="career-lab-title">
        <p className={styles.eyebrow}>SHUKATSU, SMARTER.</p>
        <h1 id="career-lab-title">AIで、就活を<br /><em>もっと戦略的に。</em></h1>
        <p className={styles.lead}>ES、自己分析、面接対策。「何から始めたらいい？」を、今日から動けるヒントに。就活ラボは、学生目線で使える就活ノウハウを発信するメディアです。</p>
        <div className={styles.actions}><SocialLink platform="instagram" href={links.instagram} primary /><SocialLink platform="x" href={links.x} /></div>
        <p className={styles.note}>SNSの正式URLは確認後に設定します。AIで作成した文章は、提出前に必ずご自身で確認してください。</p>
      </section>
      <section className={`${styles.wrap} ${styles.section}`} aria-labelledby="career-lab-topics"><p className={styles.label}>WHAT YOU GET</p><h2 id="career-lab-topics">就活で役立つ、3つのテーマ。</h2><div className={styles.grid}>
        <article className={styles.card}><p className={styles.num}>01 / ENTRY SHEET</p><h3>ES・ガクチカ</h3><p>伝わる構成、エピソードの整理、AIを使った推敲のコツ。</p></article>
        <article className={styles.card}><p className={styles.num}>02 / INTERVIEW</p><h3>面接対策</h3><p>頻出質問から深掘り対策まで。自分の言葉で話す準備。</p></article>
        <article className={styles.card}><p className={styles.num}>03 / CAREER</p><h3>自己分析・企業研究</h3><p>キャリアの軸を言語化し、企業との接点を探す視点。</p></article>
      </div></section>
      <section className={`${styles.wrap} ${styles.band}`} id="social" aria-labelledby="career-lab-social"><p className={styles.label}>FOLLOW THE LAB</p><h2 id="career-lab-social">続きは、InstagramとXで。</h2><p>図解でじっくり学ぶならInstagram。就活のヒントを素早くチェックするならX。</p><div className={styles.actions}><SocialLink platform="instagram" href={links.instagram} primary /><SocialLink platform="x" href={links.x} /></div><p className={styles.note}>URLが未設定のSNSは準備中です。フォロー数や閲覧数は取得できるまで表示しません。</p></section>
    </main>
    <footer className={styles.footer}><div className={styles.wrap}>© {new Date().getFullYear()} 就活ラボ ｜ 就活に関する一般情報を提供する独立メディアです。</div></footer>
  </div>;
}

function SocialLink({ platform, href, primary = false }: { platform: "instagram" | "x"; href: string | null; primary?: boolean }) {
  const label = platform === "instagram" ? "Instagram" : "X";
  const className = `${styles.button} ${primary ? styles.primary : styles.secondary}`;
  return href
    ? <a className={className} href={href} target="_blank" rel="noopener noreferrer" aria-label={`${label}の公式アカウントを開く`}>{label}をフォロー ↗</a>
    : <span className={`${className} ${styles.disabled}`} aria-label={`${label}は準備中`}>{label}（準備中）</span>;
}
