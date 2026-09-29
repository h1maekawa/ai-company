import { NextRequest, NextResponse } from "next/server";
import vercelConfig from "@/vercel.json";
import { BUSINESS_DEPARTMENT_IDS } from "@/app/lib/config/navigation";
import { GET as getDepartment } from "@/app/api/company/departments/[id]/route";
import { GET as getEmployees } from "@/app/api/company/departments/[id]/employees/route";
import { checkAllConnections } from "@/app/lib/system/health";
import { DEPARTMENT_NODES, PLATFORM_NODES, SYSTEM_MAP_EDGES } from "@/app/lib/company/systemMapConfig";

export const dynamic = "force-dynamic";

const safeJson = async (response: Promise<Response>) => { try { const result = await response; return result.ok ? result.json() : null; } catch { return null; } };
const cronLabel = (path: string) => path.replace("/api/cron/", "").split("-").map((word) => word[0]?.toUpperCase() + word.slice(1)).join(" ");

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const departments = await Promise.all(BUSINESS_DEPARTMENT_IDS.map(async (id) => {
    const context = { params: { id } };
    const [detail, employees] = await Promise.all([
      safeJson(getDepartment(new NextRequest(`${origin}/api/company/departments/${id}`), context)),
      safeJson(getEmployees(new NextRequest(`${origin}/api/company/departments/${id}/employees`), context)),
    ]);
    return { id, detail: detail?.department ?? null, generatedAt: detail?.generatedAt ?? null, employees: employees?.employees ?? [] };
  }));
  const providers = await checkAllConnections().catch(() => []);
  const providerNodes = providers.map((provider) => ({ id: provider.service, label: provider.label, icon: provider.icon, kind: "EXTERNAL_PROVIDER" as const, description: provider.message }));
  const crons = vercelConfig.crons.map((cron) => ({ id: `${cron.path}:${cron.schedule}`, label: cronLabel(cron.path), path: cron.path, schedule: cron.schedule, timezone: "UTC", source: "vercel.json" }));
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    nodes: [...DEPARTMENT_NODES, ...PLATFORM_NODES, ...providerNodes],
    edges: SYSTEM_MAP_EDGES,
    departments,
    providers: providers.map(({ service, label, icon, status, message, lastCheckedAt, lastSuccessAt, itemCount }) => ({ service, label, icon, status, message, lastCheckedAt, lastSuccessAt, itemCount })),
    crons,
  });
}
