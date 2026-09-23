import { NextRequest, NextResponse } from "next/server";
import { isSameOriginMutation } from "@/app/lib/company/execution/requestProtection";
import {
  assertActiveMachineMutationRequest,
  readEngineeringActiveMachine,
  updateEngineeringActiveMachine,
} from "@/app/lib/engineering/activeMachineControl";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const statusFor = (reason: string) => {
  if (reason === "ORIGIN_DENIED") return 403;
  if (reason === "GITHUB_CREDENTIAL_UNAVAILABLE" || reason === "ACTIVE_MACHINE_LOOKUP_FAILED" || reason === "ACTIVE_MACHINE_STATE_INVALID" || reason === "ENGINEERING_TASK_LOOKUP_FAILED" || reason === "ACTIVE_MACHINE_UPDATE_FAILED") return 503;
  if (reason === "ENGINEERING_TASK_RUNNING" || reason === "DIRECT_MACHINE_SWITCH_DENIED") return 409;
  return 400;
};

const safeError = (error: unknown) => {
  const reason = error instanceof Error ? error.message : "ACTIVE_MACHINE_REQUEST_FAILED";
  const allowed = new Set([
    "ORIGIN_DENIED", "HUMAN_CONFIRMATION_REQUIRED", "INVALID_ACTIVE_MACHINE",
    "GITHUB_CREDENTIAL_UNAVAILABLE", "ACTIVE_MACHINE_LOOKUP_FAILED", "ACTIVE_MACHINE_STATE_INVALID",
    "ENGINEERING_TASK_LOOKUP_FAILED", "ENGINEERING_TASK_RUNNING", "DIRECT_MACHINE_SWITCH_DENIED",
    "ACTIVE_MACHINE_UPDATE_FAILED",
  ]);
  return allowed.has(reason) ? reason : "ACTIVE_MACHINE_REQUEST_FAILED";
};

export async function GET() {
  try {
    return NextResponse.json({ activeMachine: await readEngineeringActiveMachine() });
  } catch (error) {
    const reason = safeError(error);
    return NextResponse.json({ error: reason }, { status: statusFor(reason) });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const machine = assertActiveMachineMutationRequest({
      sameOrigin: isSameOriginMutation(req),
      confirmedByHuman: body.confirmedByHuman,
      machine: body.machine,
    });
    return NextResponse.json({ activeMachine: await updateEngineeringActiveMachine(machine) });
  } catch (error) {
    const reason = safeError(error);
    return NextResponse.json({ error: reason }, { status: statusFor(reason) });
  }
}
