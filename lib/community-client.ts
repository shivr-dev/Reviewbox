import {catalogQuery} from './community-metadata';
export type CatalogEntry={id:string;title:string;description:string;version:string;question_count:number;updated_at:string;created_at?:string;metadata:Record<string,any>};
export async function listCommunity(input:unknown,signal?:AbortSignal):Promise<{packs:CatalogEntry[];cursor:string|null}>{
 const body=catalogQuery.parse(input);
 const response=await fetch('https://svaaepnixdoxubjxqgyr.supabase.co/functions/v1/review-community',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),referrerPolicy:'no-referrer',signal:AbortSignal.any([AbortSignal.timeout(20000),...(signal?[signal]:[])])});
 if(!response.ok)throw new Error('community.unavailable');const result:any=await response.json();
 if(!result||!Array.isArray(result.packs)||result.packs.length>24||result.packs.some((p:any)=>typeof p.id!=='string'||typeof p.title!=='string'||!p.metadata))throw new Error('community.unavailable');
 return result;
}
