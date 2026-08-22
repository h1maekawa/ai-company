import { NextResponse } from "next/server";
import { checkAllConnections } from "@/app/lib/system/health";
import { summarizeConnections } from "@/app/lib/system/connections";
export const dynamic = "force-dynamic";
async function response() { try { const services = await checkAllConnections(); return NextResponse.json({ services, ...summarizeConnections(services) }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "接続状態を確認できません" }, { status: 500 }); } }
export async function GET() { return response(); }
/** 全チェックはSELECT/list/auth.testのみで、作成・投稿・送信・削除を行わない。 */
export async function POST() { return response(); }
