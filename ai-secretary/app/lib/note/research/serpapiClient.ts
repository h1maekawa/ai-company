export type SerpOrganicResult = { title?: string; link?: string; snippet?: string; date?: string; source?: string };

/** Shared SerpAPI transport. Credentials stay outside company/research domain code. */
export async function searchSerpApi(query:string,maxResults:number,freshness?:string,fetchImpl:typeof fetch=fetch):Promise<SerpOrganicResult[]>{
  if(process.env.SERPAPI_ENABLED!=="true"||!process.env.SERPAPI_KEY)throw new Error("SERPAPI_UNAVAILABLE");
  const params=new URLSearchParams({engine:"google",q:query,num:String(Math.min(maxResults,20)),api_key:process.env.SERPAPI_KEY});
  if(freshness)params.set("tbs",freshness);
  const response=await fetchImpl(`https://serpapi.com/search.json?${params}`,{cache:"no-store",signal:AbortSignal.timeout(10_000)});
  if(!response.ok)throw new Error(`SERPAPI_HTTP_${response.status}`);
  return((await response.json())as{organic_results?:SerpOrganicResult[]}).organic_results??[];
}
