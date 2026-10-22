import { NextRequest, NextResponse } from "next/server";
import { careerRequestAllowed } from "@/app/lib/content/career/auth";
import {
  approveRequirementDoc,
  generateCareerRequirements,
  loadRequirementDocs,
} from "@/app/lib/content/career/requirementsAgent";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!(await careerRequestAllowed(request))) {
    return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  }

  try {
    const docs = loadRequirementDocs();
    return NextResponse.json({ docs });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "LOAD_DOCS_FAILED" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!(await careerRequestAllowed(request, true))) {
    return NextResponse.json({ error: "AUTH_ORIGIN_DENIED" }, { status: 403 });
  }

  try {
    const body = await request.json();
    if (body.action === "generate") {
      const doc = await generateCareerRequirements(String(body.requestText ?? ""), String(body.title ?? "就活SNS要件"));
      return NextResponse.json({ doc }, { status: 201 });
    } else if (body.action === "approve") {
      const doc = approveRequirementDoc(String(body.id ?? ""), "authenticated-developer");
      return NextResponse.json({ doc });
    } else {
      return NextResponse.json({ error: "UNSUPPORTED_ACTION" }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "REQUIREMENTS_FAILED" }, { status: 500 });
  }
}
