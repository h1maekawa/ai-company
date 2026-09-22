import { operationalEvent, type OperationalEvent } from "./operationalObservability";

export type OperationalEventRecorder = (event: OperationalEvent) => void | Promise<void>;
export type RouteInstrumentationOptions = { route: string; departmentId?: string; slowRequestMs?: number; record: OperationalEventRecorder; now?: () => number };

/** Shared route boundary. It records metadata only and never inspects request/response bodies or headers. */
export function withOperationalInstrumentation<TArgs extends unknown[]>(handler:(...args:TArgs)=>Promise<Response>,options:RouteInstrumentationOptions){return async(...args:TArgs):Promise<Response>=>{const now=options.now??Date.now;const started=now();try{const response=await handler(...args);const durationMs=Math.max(0,now()-started);const metadata={method:requestMethod(args[0]),statusCode:response.status,durationMs};if(response.status>=500)await options.record(operationalEvent({type:"API_ERROR",route:options.route,departmentId:options.departmentId,metadata}));else if(response.status>=400)await options.record(operationalEvent({type:"REPEATED_4XX",route:options.route,departmentId:options.departmentId,metadata}));if(durationMs>=(options.slowRequestMs??2_000))await options.record(operationalEvent({type:"SLOW_REQUEST",route:options.route,departmentId:options.departmentId,metadata}));return response;}catch(error){const durationMs=Math.max(0,now()-started);await options.record(operationalEvent({type:"API_ERROR",route:options.route,departmentId:options.departmentId,metadata:{method:requestMethod(args[0]),statusCode:500,durationMs,errorCode:error instanceof Error?error.name:"UNKNOWN_ERROR"}}));throw error;}};}

function requestMethod(value:unknown){return typeof value==="object"&&value!==null&&"method" in value&&typeof value.method==="string"?value.method:"UNKNOWN";}

export function manualCorrectionEvent(input:{draftId:string;agentId:string;editCount:number;approvalResult:string;departmentId?:string}){return operationalEvent({type:"REPEATED_CORRECTION",agentId:input.agentId,departmentId:input.departmentId,metadata:{draftId:input.draftId,editCount:input.editCount,approvalResult:input.approvalResult}});}
