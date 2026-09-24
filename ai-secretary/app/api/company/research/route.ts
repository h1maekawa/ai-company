import { NextRequest,NextResponse } from "next/server";
import { getExecutionStore,loadExecutionState } from "@/app/lib/company/execution/store";
import { DEPARTMENT_RESEARCH_POLICIES } from "@/app/lib/company/research/policies";
import { researchHealth } from "@/app/lib/company/research/platform";
import { isSameOriginMutation } from "@/app/lib/company/execution/requestProtection";
import { runInteractiveResearch } from "@/app/lib/company/research/intelligence/service";
import { preRoute } from "@/app/lib/router/preRouter";

export const dynamic = "force-dynamic";
// standard budget（検索45秒）+ 分類LLM1回 + 合成LLM1回が収まる上限。Vercel設定は変更しない
export const maxDuration = 120;

export async function GET(req:NextRequest){try{const state=await loadExecutionState();const departmentId=req.nextUrl.searchParams.get("departmentId");const runtime=state.runtime;const items=(runtime?.researchItems??[]).filter((item)=>!departmentId||item.departmentIds.includes(departmentId));const artifacts=(runtime?.researchArtifacts??[]).filter((artifact)=>!departmentId||departmentId in artifact.departmentContexts);const health=DEPARTMENT_RESEARCH_POLICIES.filter((policy)=>!departmentId||policy.departmentId===departmentId).map((policy)=>researchHealth(policy.departmentId,runtime?.researchRuns??[],runtime?.researchItems??[]));return NextResponse.json({items:items.slice(-100),artifacts:artifacts.slice(-50),intelligence:artifacts.filter((artifact)=>artifact.intelligence).slice(-50),runs:(runtime?.researchRuns??[]).filter((run)=>!departmentId||run.departmentId===departmentId).slice(-50),health});}catch{return NextResponse.json({items:null,artifacts:null,intelligence:null,runs:null,health:null,error:"RESEARCH_STORE_UNAVAILABLE"},{status:503});}}

/**
 * Ask Research（Research & Intelligence）。Researchは自動実行してよいが、Trade / Publish / Deployへは進まない。
 * 書き込むのは Execution Store の Research Artifact / Item と、Knowledge Inbox の Capture だけ。
 *
 * G: 既存Execution Storeのidempotency infrastructureを再利用する。同じrequestのretryで
 * 二重LLM・二重Search・二重Artifact保存・二重Knowledge Captureを避ける（新しいidempotency storeは作らない）。
 */
export async function POST(req:NextRequest){
  if(!isSameOriginMutation(req))return NextResponse.json({error:"ORIGIN_DENIED"},{status:403});
  const key=req.headers.get("idempotency-key");
  if(!key)return NextResponse.json({error:"IDEMPOTENCY_KEY_REQUIRED"},{status:400});
  const body=await req.json().catch(()=>({}));
  if(typeof body.question!=="string"||!body.question.trim())return NextResponse.json({error:"QUESTION_REQUIRED"},{status:400});
  // 投資判断・Content作成・家計はResearchではない。Layer 1と同じ判定で担当へ戻す（R&Iから判断・公開へは進まない）
  const routed=preRoute(body.question);
  if(routed&&routed!=="research")return NextResponse.json({error:"NOT_A_RESEARCH_REQUEST",routeTo:routed},{status:409});
  const store=getExecutionStore();
  const prior=await store.getIdempotencyResult("research-intelligence-ask",key);
  if(prior)return NextResponse.json(prior);
  if(!(await store.claimIdempotency("research-intelligence-ask",key)))return NextResponse.json({error:"DUPLICATE_REQUEST_IN_PROGRESS"},{status:409});
  try{
    const result=await runInteractiveResearch({question:body.question});
    const response={routing:result.routing,artifact:result.artifact,reused:result.reused,refreshed:result.refreshed};
    await store.completeIdempotency("research-intelligence-ask",key,response);
    return NextResponse.json(response);
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"RESEARCH_FAILED"},{status:500});}
}
