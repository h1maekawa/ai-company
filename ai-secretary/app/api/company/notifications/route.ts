import { NextResponse } from "next/server";
import { loadExecutionState } from "@/app/lib/company/execution/store";
import { buildNotificationEvents } from "@/app/lib/notifications/events";
import { GET as getEngineering } from "@/app/api/engineering/requests/route";
export const dynamic = "force-dynamic";
export async function GET() { const [state, engineeringResponse] = await Promise.all([loadExecutionState(), getEngineering()]); const engineering = engineeringResponse.ok ? await engineeringResponse.json() : null; return NextResponse.json({ notifications: buildNotificationEvents(state, engineering) }); }
