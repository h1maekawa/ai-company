import type { ResearchRun } from "./types";
import type { DepartmentResearchPolicy } from "./types";
const INTERVALS:Record<string,number>={hourly:3_600_000,daily:86_400_000,weekdays:86_400_000,weekly:604_800_000};
export function nextEligibleAt(policy:DepartmentResearchPolicy,runs:ResearchRun[],now=new Date()){const last=runs.filter((run)=>run.departmentId===policy.departmentId).map((run)=>Date.parse(run.completedAt??run.startedAt)).filter(Number.isFinite).sort((a,b)=>b-a)[0];if(last===undefined)return null;return new Date(last+(INTERVALS[policy.schedule??""]??86_400_000)).toISOString();}
export function researchEligible(policy:DepartmentResearchPolicy,runs:ResearchRun[],now=new Date()){if(!policy.enabled)return false;const next=nextEligibleAt(policy,runs,now);return next===null||Date.parse(next)<=now.getTime();}
