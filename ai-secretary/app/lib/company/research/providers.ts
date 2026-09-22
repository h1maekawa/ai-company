import type { ExecutionState } from "../execution/store";
import type { ResearchProvider } from "./types";
import { loadResearchInbox } from "../../note/research/store";
import { loadWatchlist } from "../../investing/watchlist";

export function internalTelemetryProvider(state:ExecutionState):ResearchProvider { return { id:"execution-store", sourceType:"runtime", async search(query){ const events=(state.runtime?.operationalEvents??[]).filter((event)=>!event.departmentId||event.departmentId===query.departmentId).slice(-query.maxItems); return {items:events.map((event)=>({title:event.type,summary:`${event.type} observed at ${event.occurredAt}`,sourceName:"Execution Store",publishedAt:event.occurredAt,reliability:"PRIMARY",tags:[event.type.toLowerCase()]}))}; } }; }
export function missionHistoryProvider(state:ExecutionState):ResearchProvider { return { id:"mission-history", sourceType:"internal", async search(query){ return {items:state.missions.slice(-query.maxItems).map((mission)=>({title:`Mission ${mission.id}`,summary:`Mission status: ${mission.status}`,sourceName:"Mission History",publishedAt:mission.completedAt??mission.startedAt??mission.createdAt,reliability:"PRIMARY",tags:[String(mission.status).toLowerCase()]}))}; } }; }
export async function availableResearchProviders(state:ExecutionState):Promise<ResearchProvider[]>{
  const [creatorItems,watchlist]=await Promise.all([loadResearchInbox().catch(()=>[]),loadWatchlist().catch(()=>({themes:[],updatedAt:null}))]);
  const creator:ResearchProvider={id:"existing-creator-research",sourceType:"internal",async search(query){return {items:creatorItems.slice(0,query.maxItems).map((item)=>({title:item.title??item.textExcerpt.slice(0,120),summary:item.textExcerpt,sourceUrl:item.sourceUrl,sourceName:item.platform,publishedAt:item.publishedAt??item.fetchedAt,reliability:"MEDIUM" as const,tags:item.detectedGenreIds}))};}};
  const fund:ResearchProvider={id:"fund-watchlist",sourceType:"market",async search(query){return {items:watchlist.themes.flatMap((theme)=>theme.items.map((item)=>({title:`${item.ticker} ${item.name}`,summary:`Watchlist: ${theme.theme}; ${item.reason}`,sourceName:"Fund Watchlist",publishedAt:watchlist.updatedAt??undefined,reliability:"PRIMARY" as const,tags:[theme.theme,item.ticker]}))).slice(0,query.maxItems)};}};
  return [creator,fund,internalTelemetryProvider(state),missionHistoryProvider(state)];
}
