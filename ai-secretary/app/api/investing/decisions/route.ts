import { NextResponse } from "next/server";
import { loadInvestmentDecisions } from "@/app/lib/investing/intelligence/store";
export const dynamic = "force-dynamic";
export async function GET() { return NextResponse.json({ decisions: await loadInvestmentDecisions() }); }
