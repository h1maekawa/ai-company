import { NextResponse } from "next/server";
import { DEPARTMENT_IDS } from "@/app/lib/mobile-ceo/departments";
export async function GET() { return NextResponse.json({ departments: DEPARTMENT_IDS }); }
