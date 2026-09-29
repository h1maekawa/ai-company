import { runInvestmentCron } from "@/app/lib/investing/intelligence/cron";
export const maxDuration = 300;
export async function GET(request: Request) { return runInvestmentCron(request, "notify"); }
