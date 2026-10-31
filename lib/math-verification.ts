import type {MathVerificationOptions,MathVerification} from './math-verification-core';
export type {MathVerification,MathVerificationOptions} from './math-verification-core';
export async function verifyMathAnswer(studentAnswer:string,referenceAnswer:string,options:MathVerificationOptions={}):Promise<MathVerification>{
 if(typeof Worker==='undefined')return (await import('./math-verification-core')).verifyMathCore(studentAnswer,referenceAnswer,options);
 return new Promise(resolve=>{
  const fallback=(reason:string):MathVerification=>({status:'undetermined',method:'worker',assumptions:[],reason});
  let worker:Worker;try{worker=new Worker(new URL('./math-verification.worker.ts',import.meta.url),{type:'module'});}catch{resolve(fallback('数学核验工具未能加载，可继续手动检查'));return;}
  const timer=setTimeout(()=>{worker.terminate();resolve(fallback('核验超时，未自动判错，请人工复核'));},4500);
  worker.onmessage=(e:MessageEvent<MathVerification>)=>{clearTimeout(timer);worker.terminate();resolve(e.data);};worker.onerror=()=>{clearTimeout(timer);worker.terminate();resolve(fallback('数学核验暂不可用，未自动判错'));};worker.postMessage({student:studentAnswer,reference:referenceAnswer,options});
 });
}
