"use client";

import { ReviewFeed } from "@/components/review/ReviewFeed";

/**
 * /content/review — 承認フィード（要件2）
 *
 * note用・X用・リサーチ系に分かれていた承認を1画面に集約する。
 * 各系統のデータの保存先は変えていない（読み取りと決定の入口だけを統一）。
 */
export default function ReviewPage() {
  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-base font-bold text-white">レビュー待ち</h2>
        <p className="mt-1 text-xs leading-relaxed text-sub">
          すべてのエージェントのタスクがここに集まります。
          自動テストを通過していないものは、修正するまで承認できません。
        </p>
      </header>

      <ReviewFeed />
    </div>
  );
}
