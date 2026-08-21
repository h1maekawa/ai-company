import { NextResponse } from "next/server";
import { loadPerformance } from "@/app/lib/note/research/store";
import { contentPillarBalance, learningSignals, performanceRates, summarizePerformance } from "@/app/lib/note/research/performance";
import { loadBrand } from "@/app/lib/note/store";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const [file, brand] = await Promise.all([loadPerformance(), loadBrand()]);
  return NextResponse.json({
    records: file.records.map((record) => ({ ...record, rates: performanceRates(record) })),
    summary: summarizePerformance(file.records),
    learning: learningSignals(file.records),
    pillarBalance: contentPillarBalance(file.records, brand.brand.contentPillars),
  });
}
