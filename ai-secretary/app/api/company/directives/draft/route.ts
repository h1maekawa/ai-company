import { NextRequest, NextResponse } from "next/server";
import { DEPARTMENT_IDS, draftDirective, type DepartmentId } from "@/app/lib/mobile-ceo/departments";
import { isSameOriginMutation } from "@/app/lib/company/execution/requestProtection";
import { getExecutionStore } from "@/app/lib/company/execution/store";
export async function POST(req: NextRequest) {
  if (!isSameOriginMutation(req)) return NextResponse.json({ error: "ORIGIN_DENIED" }, { status: 403 });
  try { const body = await req.json(); if (!DEPARTMENT_IDS.includes(body.department as DepartmentId)) return NextResponse.json({ error: "UNKNOWN_DEPARTMENT" }, { status: 400 }); const directive = draftDirective(body); const store = getExecutionStore(); if (!(await store.claimIdempotency("department-directive-draft", directive.id))) return NextResponse.json({ error: "DRAFT_ID_CONFLICT" }, { status: 409 }); await store.completeIdempotency("department-directive-draft", directive.id, { directive }, 86_400); return NextResponse.json({ draftId: directive.id, directive }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "INVALID_REQUEST" }, { status: 400 }); }
}
