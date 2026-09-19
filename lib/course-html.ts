// The document runs in an opaque-origin iframe. Its only host capability is this bridge.
export function assertCourseHTML(html: unknown): asserts html is string {
  if (typeof html !== 'string' || !html.trim())
    throw new Error('课件内容为空，请重新生成。');
  if (html.length > 200000)
    throw new Error('本节课件超过保存容量，请拆分学习资料。');
  if (
    /<meta\b[^>]*http-equiv\s*=\s*["']?refresh\b|<base\b|<(?:iframe|object|embed)\b/i.test(
      html,
    ) ||
    /\b(?:window\s*\.\s*|document\s*\.\s*|top\s*\.\s*|parent\s*\.\s*)?location\s*(?:=(?!=)|\.(?:href\s*=|assign\s*\(|replace\s*\())/i.test(
      html,
    )
  )
    throw new Error(
      '课件包含页面跳转或嵌入外部页面，未通过安全检查；请修改后重试。',
    );
}
export function buildCourseDocument(
  html: string,
  channel: string,
  preserve = false,
) {
  const bodyAttributes = html.match(/<body\b([^>]*)>/i)?.[1] ?? '';
  const content = html
    .replace(/<!doctype[^>]*>/gi, '')
    .replace(/<\/?(?:html|head|body)\b[^>]*>/gi, '')
    .replace(/<(?:meta|base|link)\b[^>]*>/gi, '')
    .replace(/<(iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(?:iframe|object|embed)\b[^>]*\/?>/gi, '')
    .replace(/<script\b[^>]*\bsrc\s*=[^>]*>[\s\S]*?<\/script\s*>/gi, '');
  const token = JSON.stringify(channel).replace(/</g, '\\u003c');
  const bridge = `(()=>{const channel=${token};let serial=0;const pending=new Map();const call=(method,args={})=>new Promise((resolve,reject)=>{const id=String(++serial);const timer=setTimeout(()=>{pending.delete(id);reject(new Error('学习接口响应超时，请重试'));},25000);pending.set(id,{resolve,reject,timer});parent.postMessage({courseBridge:1,channel,id,method,args},'*');});window.ReviewCourse=Object.freeze({getState:()=>call('state'),check:(index,answer)=>call('check',{index,answer}),saveState:state=>call('save',{state}),canPractice:()=>call('eligibility'),startPractice:()=>call('practice'),ask:text=>call('ask',{text})});addEventListener('message',e=>{const m=e.data;if(e.source!==parent||!m||m.channel!==channel)return;if(m.font&&/^data:font\\/woff2;base64,[A-Za-z0-9+/=]+$/.test(m.font)){const style=document.createElement('style');style.textContent='@font-face{font-family:"Noto Sans SC";src:url("'+m.font+'") format("woff2");font-display:swap;}';document.head.appendChild(style);return;}const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error(m.error)):p.resolve(m.value);});const reportError=()=>parent.postMessage({courseBridge:1,channel,method:'error'},'*');addEventListener('error',reportError,true);addEventListener('unhandledrejection',reportError);addEventListener('securitypolicyviolation',reportError);addEventListener('DOMContentLoaded',()=>{new ResizeObserver(()=>parent.postMessage({courseBridge:1,channel,method:'resize',height:document.documentElement.scrollHeight},'*')).observe(document.body);});})();`;
  if (preserve) {
    assertCourseHTML(html);
    const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; worker-src blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none';">`;
    const injection = policy + `<script>${bridge}</script>`;
    // Insert capabilities before user scripts. Do not reserialize the document,
    // rewrite attributes, move styles or override authored animations.
    const head = /<head\b[^>]*>/i.exec(html);
    const firstScript = html.search(/<script\b/i);
    if (head && (firstScript < 0 || firstScript > head.index)) {
      const at = head.index + head[0].length;
      return html.slice(0, at) + injection + html.slice(at);
    }
    const root = /<html\b[^>]*>/i.exec(html);
    if (root && (firstScript < 0 || firstScript > root.index)) {
      const at = root.index + root[0].length;
      return (
        html.slice(0, at) + '<head>' + injection + '</head>' + html.slice(at)
      );
    }
    return (
      '<!doctype html><html><head>' +
      injection +
      '</head><body>' +
      html +
      '</body></html>'
    );
  }
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none';"><style>html,body{margin:0;box-sizing:border-box;font-family:'Noto Sans SC','PingFang SC','Microsoft YaHei',sans-serif;color:#23342e;background:#fff}*{box-sizing:border-box}button,input,textarea,select{font-family:inherit}img,svg,canvas{max-width:100%}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}</style><script>${bridge}</script></head><body ${bodyAttributes}>${content}</body></html>`;
}
export function practiceEligibility(
  total: number,
  passed: number[],
  freeForm = false,
) {
  const valid = new Set(
    passed.filter((i) => Number.isInteger(i) && i >= 0 && i < total),
  );
  return {
    allowed: freeForm || (total > 0 && valid.size === total),
    remaining: Math.max(0, total - valid.size),
  };
}
