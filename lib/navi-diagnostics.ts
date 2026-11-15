/** Small, allowlisted diagnostics. Never contain prompts, answers, reasoning, credentials or full HTTP bodies. */
export type NaviDiagnostic={version:1;code:string;stage:string;requestId:string;httpStatus?:number;upstreamCodes?:string[];detail?:string;reason?:string;attempts?:number;retryable:boolean};
export function diagnosticText(input:unknown,max=360){
 return String(input??'').replace(/Bearer\s+[^\s,;"']+/gi,'Bearer [redacted]').replace(/\b(?:sk-|sb_secret_|eyJ)[a-zA-Z0-9._-]+/g,'[redacted]').replace(/\b(?:authorization|api[_-]?key|token|secret|password)\b\s*[:=]\s*["']?[^\s,;"'}]+/gi,'credential=[redacted]').replace(/https?:\/\/[^\s<>"')]+/gi,'[URL]').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email]').replace(/\b[a-f0-9]{32,}\b/gi,'[identifier]').slice(0,max);
}
export function safeDiagnostic(value:unknown):NaviDiagnostic|undefined{
 if(!value||typeof value!=='object')return;const v=value as any;
 if(typeof v.code!=='string'||!/^RB-[A-Z0-9-]{2,70}$/.test(v.code))return;
 const requestId=typeof v.requestId==='string'&&/^[a-zA-Z0-9-]{8,100}$/.test(v.requestId)?v.requestId:'unavailable';
 return {version:1,code:v.code,stage:diagnosticText(v.stage,50),requestId,retryable:v.retryable===true,...(Number.isInteger(v.httpStatus)&&v.httpStatus>=100&&v.httpStatus<=599?{httpStatus:v.httpStatus}:{}),...(Array.isArray(v.upstreamCodes)?{upstreamCodes:v.upstreamCodes.filter((c:unknown)=>typeof c==='string'&&/^[a-zA-Z0-9_-]{1,40}$/.test(c)).slice(0,5)}:{}),...(v.detail?{detail:diagnosticText(v.detail)}:{}),...(v.reason?{reason:diagnosticText(v.reason,80)}:{}),...(Number.isInteger(v.attempts)?{attempts:Math.max(1,Math.min(3,v.attempts))}:{})};
}
export function naviDiagnostic(code:string,stage:string,fields:Partial<NaviDiagnostic>={}):NaviDiagnostic{
 return safeDiagnostic({version:1,code,stage,requestId:crypto.randomUUID(),retryable:false,...fields})!;
}
export class DiagnosticError extends Error {
 constructor(message:string,public diagnostic:NaviDiagnostic,public code='request'){super(message);this.name='DiagnosticError';}
}
export function diagnoseNaviFailure(error:unknown,stage='client',requestId?:string):NaviDiagnostic{
 const known=safeDiagnostic((error as any)?.diagnostic);if(known)return {...known,...(requestId?{requestId}:{})};
 const code=(error as any)?.code;
 const mapped:Record<string,string>={auth:'RB-AUTH-REQUIRED',ai_unconfigured:'RB-AI-CONFIG',membership_unconfigured:'RB-MEMBERSHIP-CONFIG',membership_upgrade:'RB-MEMBERSHIP-REQUIRED',membership_credits:'RB-CREDITS-EXHAUSTED',membership_rate:'RB-RATE-LIMIT',membership_replay_mismatch:'RB-REQUEST-MISMATCH',timeout:'RB-TIMEOUT',format:'RB-MODEL-JSON',citation:'RB-CITATION',context:'RB-CONTEXT',save:'RB-STORAGE'};
 const timeout=error instanceof Error&&/timeout|timed out/i.test(error.name+' '+error.message);
 return naviDiagnostic(mapped[code]??(timeout?'RB-TIMEOUT':error instanceof TypeError?'RB-NETWORK':'RB-REQUEST'),stage,{...(requestId?{requestId}:{}),retryable:timeout||error instanceof TypeError});
}
export function diagnosticReport(diagnostic:NaviDiagnostic){return JSON.stringify(safeDiagnostic(diagnostic),null,2);}
