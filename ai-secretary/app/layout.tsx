import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI秘書",
  description: "あなた専用のAI秘書",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
