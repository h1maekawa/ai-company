"use client";

import { ReactNode } from "react";
import { MotionConfig } from "framer-motion";
import { AiAssistant } from "@/components/investing/AiAssistant";

/**
 * reducedMotion="user" で OSの「視差効果を減らす」設定を尊重する。
 * 設定がONの端末では、アニメーションを止めて即座に最終状態を表示する。
 */
export default function InvestingLayout({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      {children}
      <AiAssistant />
    </MotionConfig>
  );
}
