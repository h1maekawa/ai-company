import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { SecretaryHeader } from "@/components/SecretaryHeader";

export const metadata: Metadata = {
  title: "AI秘書",
  description: "あなた専用のAI秘書",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <SecretaryHeader />
        {children}
      </body>
    </html>
  );
}