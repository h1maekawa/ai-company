import { NextRequest, NextResponse } from "next/server";
import vercelConfig from "@/vercel.json";
import { BUSINESS_DEPARTMENT_IDS } from "@/app/lib/config/navigation";
import { GET as getDepartment } from "@/app/api/company/departments/[id]/route";
import { GET as getEmployees } from "@/app/api/company/departments/[id]/employees/route";
import { GET as getResearch } from "@/app/api/company/research/route";
import { GET as getExecutionObservability } from "@/app/api/company/runtime/observability/route";
import { checkAllConnections } from "@/app/lib/system/health";
import { DEPARTMENT_NODES, PLATFORM_NODES, SYSTEM_MAP_EDGES, type SystemMapStatus } from "@/app/lib/company/systemMapConfig";

export const dynamic = "force-dynamic";

const safeJson = async (response: Promise<Response>) => { try { const result = await response; return result.ok ? result.json() : null; } catch { return null; } };
const cronLabel = (path: string) => path.replace("/api/cron/", "").split("-").map((word) => word[0]?.toUpperCase() + word.slice(1)).join(" ");
const providerStatus = (status?: string): SystemMapStatus => status === "connected" ? "CONNECTED" : status === "warning" ? "PARTIAL" : status === "not_configured" ? "NOT_CONFIGURED" : status === "disconnected" ? "ERROR" : "UNKNOWN";

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
  const [providers, research, execution] = await Promise.all([
    checkAllConnections().catch(() => []),
    safeJson(getResearch(new NextRequest(`${origin}/api/company/research`))),
    safeJson(getExecutionObservability()),
  ]);
  const providerNodes = providers.map((provider) => ({ id: provider.service, label: provider.label, icon: provider.icon, kind: "EXTERNAL_PROVIDER" as const, description: provider.message, status: providerStatus(provider.status) }));
  const vault = providers.find((provider) => provider.service === "vault");
  const researchHealth = Array.isArray(research?.health) ? research.health : null;
  const researchStatus: SystemMapStatus = !researchHealth ? "UNKNOWN" : researchHealth.some((item: { status?: string }) => item.status === "FAILED") ? "ERROR" : researchHealth.some((item: { status?: string }) => ["PARTIAL", "STALE"].includes(item.status ?? "")) ? "PARTIAL" : researchHealth.length > 0 ? "ACTIVE" : "UNKNOWN";
  const platformStatus: Record<string, SystemMapStatus> = {
    research: researchStatus,
    knowledge: providerStatus(vault?.status),
    execution: execution?.store === "connected" ? "ACTIVE" : "UNKNOWN",
    human: "ACTIVE",
  };
  const platformNodes = PLATFORM_NODES.map((node) => ({ ...node, status: platformStatus[node.id] ?? "UNKNOWN" }));
  const providerById = new Map(providerNodes.map((node) => [node.id, node]));
  const edges = SYSTEM_MAP_EDGES.map((edge) => {
    const external = providerById.get(edge.from) ?? providerById.get(edge.to);
    return { ...edge, status: edge.planned ? "PLANNED" as const : external?.status ?? "DEFINED" as const };
  });
  const crons = vercelConfig.crons.map((cron) => ({ id: `${cron.path}:${cron.schedule}`, label: cronLabel(cron.path), path: cron.path, schedule: cron.schedule, timezone: "UTC", source: "vercel.json" }));
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    nodes: [...DEPARTMENT_NODES, ...platformNodes, ...providerNodes],
    edges,
    departments,
    providers: providers.map(({ service, label, icon, status, message, lastCheckedAt, lastSuccessAt, itemCount }) => ({ service, label, icon, status, message, lastCheckedAt, lastSuccessAt, itemCount })),
    crons,
  });
}
