import type { ExecutionState } from "../execution/store";
import type { ResearchProvider } from "./types";
import { loadResearchInbox } from "../../note/research/store";
import { loadWatchlist } from "../../investing/watchlist";
import { createWebSearchProvider } from "./webProvider";
import { createRssProvider } from "./rssProvider";
import { createGithubResearchProvider } from "./githubProvider";

export function internalTelemetryProvider(state:ExecutionState):ResearchProvider { return { id:"execution-store", sourceType:"runtime", async search(query){ const events=(state.runtime?.operationalEvents??[]).filter((event)=>!event.departmentId||event.departmentId===query.departmentId).slice(-query.maxItems); return {items:events.map((event)=>({title:event.type,summary:`${event.type} observed at ${event.occurredAt}`,sourceName:"Execution Store",publishedAt:event.occurredAt,reliability:"PRIMARY",tags:[event.type.toLowerCase()]}))}; } }; }
export function missionHistoryProvider(state:ExecutionState):ResearchProvider { return { id:"mission-history", sourceType:"internal", async search(query){ return {items:state.missions.slice(-query.maxItems).map((mission)=>({title:`Mission ${mission.id}`,summary:`Mission status: ${mission.status}`,sourceName:"Mission History",publishedAt:mission.completedAt??mission.startedAt??mission.createdAt,reliability:"PRIMARY",tags:[String(mission.status).toLowerCase()]}))}; } }; }
export async function availableResearchProviders(state:ExecutionState):Promise<ResearchProvider[]>{
  const [creatorItems,watchlist]=await Promise.all([loadResearchInbox().catch(()=>[]),loadWatchlist().catch(()=>({themes:[],updatedAt:null}))]);
  const creator:ResearchProvider={id:"existing-creator-research",sourceType:"internal",async search(query){return {items:creatorItems.slice(0,query.maxItems).map((item)=>({title:item.title??item.textExcerpt.slice(0,120),summary:item.textExcerpt,sourceUrl:item.sourceUrl,sourceName:item.platform,publishedAt:item.publishedAt??item.fetchedAt,reliability:"MEDIUM" as const,tags:item.detectedGenreIds}))};}};
  const fund:ResearchProvider={id:"fund-watchlist",sourceType:"market",async search(query){return {items:watchlist.themes.flatMap((theme)=>theme.items.map((item)=>({title:`${item.ticker} ${item.name}`,summary:`Watchlist: ${theme.theme}; ${item.reason}`,sourceName:"Fund Watchlist",publishedAt:watchlist.updatedAt??undefined,reliability:"PRIMARY" as const,tags:[theme.theme,item.ticker]}))).slice(0,query.maxItems)};}};
  const web=createWebSearchProvider();
  const official:ResearchProvider={id:"watchlist-official-sources",sourceType:"api",async search(query){
    const companies=watchlist.themes.flatMap((theme)=>theme.items).filter((item)=>item.name||item.ticker).slice(0,Math.min(query.maxItems,8));
    const settled=await Promise.allSettled(companies.map((item)=>web.search({...query,topic:`${item.name} ${item.ticker} official investor relations filing`,maxItems:2})));
    const items=settled.flatMap((result)=>result.status==="fulfilled"?result.value.items.map((entry)=>({...entry,tags:[...(entry.tags??[]),"official-source-candidate",itemTag(entry.title,companies)]})):[]);
    if(companies.length&&settled.every((result)=>result.status==="rejected"))throw new Error("OFFICIAL_SOURCE_UNAVAILABLE");
    return {items:items.slice(0,query.maxItems),warnings:settled.some((result)=>result.status==="rejected")?["OFFICIAL_SOURCE_PARTIAL"]:[],checkedAt:new Date().toISOString()};
  }};
  const rssUrls=(process.env.RESEARCH_RSS_FEEDS??"").split(",").map((value)=>value.trim()).filter(Boolean);
  return [creator,fund,web,createRssProvider(rssUrls),createGithubResearchProvider(),official,internalTelemetryProvider(state),missionHistoryProvider(state)];
}

function itemTag(title:string,items:Array<{name:string;ticker:string}>){const found=items.find((item)=>title.toLowerCase().includes(item.ticker.toLowerCase())||title.toLowerCase().includes(item.name.toLowerCase()));return found?.ticker||"watchlist";}
