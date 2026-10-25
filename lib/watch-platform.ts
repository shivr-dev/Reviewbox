export type WatchBrowserEnvironment={userAgent:string;screenWidth:number;screenHeight:number;coarsePointer:boolean;search?:string};
/** Device screen dimensions, never the current desktop window size, are used for the fallback. */
export function isWatchBrowser(env:WatchBrowserEnvironment) {
  if(new URLSearchParams(env.search??'').get('watch')==='1')return true;
  if(/\bOWW231\b|OPPO[ _-]?Watch|ColorOS[ _-]?Watch|Wear[ _-]?OS/i.test(env.userAgent))return true;
  return /Android/i.test(env.userAgent)&&env.coarsePointer&&env.screenWidth===env.screenHeight&&env.screenWidth>=180&&env.screenWidth<=520;
}
export type WatchRelease={version:string;status:'testing'|'ready';url:string;sha256:string;bytes:number;minimumAndroid:number;model:string};
export function validWatchRelease(value:unknown):value is WatchRelease {
  if(!value||typeof value!=='object')return false;
  const r=value as WatchRelease;
  return typeof r.version==='string'&&r.version.length<40&&r.status==='ready'&&
    /^https:\/\/svaaepnixdoxubjxqgyr\.supabase\.co\/storage\/v1\/object\/public\/reviewbox-releases\/[\w./-]+\.apk(?:\?download=[\w.-]+)?$/.test(r.url)&&
    /^[a-f0-9]{64}$/.test(r.sha256)&&Number.isInteger(r.bytes)&&r.bytes>0&&r.bytes<100000000&&r.minimumAndroid>=11;
}
