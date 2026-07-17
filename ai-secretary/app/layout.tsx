import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { SecretaryHeader } from "@/components/SecretaryHeader";

export const metadata: Metadata = {
  title: "AI秘書",
  description: "あなた専用のAI秘書",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "AI秘書",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
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