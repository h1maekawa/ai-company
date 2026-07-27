"use client";

import { Filter } from "lucide-react";
import { ComingSoon } from "@/components/investing/ComingSoon";

export default function ScreeningPage() {
  return (
    <ComingSoon
      title="スクリーニング"
      icon={<Filter className="h-7 w-7" />}
      description="条件に合う銘柄を絞り込む機能です。全銘柄の財務・株価データを持つ外部データソースが必要なため、まだ有効化していません。"
      needs={["銘柄マスタと財務指標のデータソース", "株価スナップショットの定期取得"]}
    />
  );
}
