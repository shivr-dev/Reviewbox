import {generate} from './ai-server';
import {selectReferences} from './reference-selection';

/** Reference retrieval is optional enrichment. It cannot bypass the existing
 * independent solve/judge pipeline in resumeVerifiedJob. References are never
 * accepted from the browser as trusted generated provenance. */
export async function generateWithReferences(input:any,request?:(path:string,init:RequestInit)=>Promise<any>){
  let selection:Awaited<ReturnType<typeof selectReferences>>|undefined;
  if(request && Array.isArray(input.previousErrors) && input.previousErrors.length){
    try { selection=await selectReferences(input,request); }
    catch { /* Offline/empty/missing corpus keeps the original authoring path. */ }
  }
  return generate(input,selection?.items);
}
