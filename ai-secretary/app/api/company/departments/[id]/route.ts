import { NextRequest, NextResponse } from "next/server";
import { DEPARTMENT_IDS, buildDepartmentReadModel, type DepartmentId } from "@/app/lib/mobile-ceo/departments";
import { GET as content } from "@/app/api/content/dashboard/route";
import { GET as economics } from "@/app/api/company/economics/route";
import { GET as opportunities } from "@/app/api/company/opportunities/route";
import { GET as recommendations } from "@/app/api/fund/recommendations/route";
import { GET as decisions } from "@/app/api/fund/decisions/route";
import { GET as transactions } from "@/app/api/fund/transactions/route";
import { GET as performance } from "@/app/api/fund/performance/route";
import { GET as learning } from "@/app/api/fund/learning/route";
import { GET as metrics } from "@/app/api/company/metrics/route";
import { GET as execution } from "@/app/api/company/execution/route";
import { GET as knowledge } from "@/app/api/knowledge/dashboard/route";
import { GET as planning } from "@/app/api/planning/route";
import { GET as engineering } from "@/app/api/engineering/requests/route";

export const dynamic = "force-dynamic";
const json = async (promise: Promise<Response>) => { try { const response = await promise; return response.ok ? response.json() : null; } catch { return null; } };
const request = (url: string) => new NextRequest(url);

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!DEPARTMENT_IDS.includes(params.id as DepartmentId)) return NextResponse.json({ error: "UNKNOWN_DEPARTMENT" }, { status: 404 });
  const id = params.id as DepartmentId; const origin = req.nextUrl.origin;
  let data: Record<string, unknown> = {};
  if (id === "creator") { const [a,b,c] = await Promise.all([json(content(request(`${origin}/api/content/dashboard?period=month`))), json(economics(request(`${origin}/api/company/economics`))), json(opportunities())]); data = { content:a, economics:b, opportunities:c }; }
  if (id === "fund") { const [a,b,c,d,e] = await Promise.all([json(recommendations()), json(decisions()), json(transactions()), json(performance()), json(learning())]); data = { recommendations:a, decisions:b, transactions:c, performance:d, learning:e }; }
  if (id === "operations") { const [a,b] = await Promise.all([json(metrics(request(`${origin}/api/company/metrics?days=14`))), json(execution())]); data = { metrics:a, execution:b }; }
  if (id === "knowledge") data = { knowledge: await json(knowledge(request(`${origin}/api/knowledge/dashboard`))) };
  if (id === "planning") { const [a,b] = await Promise.all([json(planning(request(`${origin}/api/planning`))), json(execution())]); data = { planning:a, execution:b }; }
  if (id === "engineering") data = { engineering: await json(engineering()) };
  return NextResponse.json({ department: buildDepartmentReadModel(id, data), generatedAt: new Date().toISOString() });
}
