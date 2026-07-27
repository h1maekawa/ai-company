"use client";

import { CircleDollarSign } from "lucide-react";
import { ComingSoon } from "@/components/investing/ComingSoon";

export default function DividendsPage() {
  return (
    <ComingSoon
      title="配当管理"
      icon={<CircleDollarSign className="h-7 w-7" />}
      description="受取配当の履歴と年間見込みを管理する画面です。配当実績は証券口座の入出金データが必要なため、取込経路を用意してから公開します。"
      needs={["証券口座の配当入金明細（CSV等）", "銘柄ごとの配当予定データ"]}
    />
  );
}
