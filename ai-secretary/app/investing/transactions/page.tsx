"use client";

import { LineChart } from "lucide-react";
import { ComingSoon } from "@/components/investing/ComingSoon";

export default function TransactionsPage() {
  return (
    <ComingSoon
      title="取引履歴"
      icon={<LineChart className="h-7 w-7" />}
      description="売買の履歴と、その時の判断理由（AI投資日記）を振り返る画面です。投資判断ログは投資部門に蓄積が始まっています。"
      needs={["約定履歴のCSV取込", "購入時の「なぜ買うか」入力フロー"]}
      backHref="/fund"
      backLabel="投資部門を開く"
    />
  );
}
