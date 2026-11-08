import { readFileSync } from 'node:fs';

export function releaseInfo() {
  const r = JSON.parse(readFileSync(new URL('../public/watch-release.json', import.meta.url), 'utf8'));
  if (r.status !== 'ready' || !/^https:\/\/svaaepnixdoxubjxqgyr\.supabase\.co\/storage\/v1\/object\/public\/reviewbox-releases\/[\w./-]+\.apk(?:\?download=[\w.-]+)?$/.test(r.url) || !/^[a-f0-9]{64}$/.test(r.sha256) || !/^[\w.-]{1,40}$/.test(r.version)) throw new Error('Watch release is not ready or invalid');
  return r;
}

export const watchDownloadStyle = `
html,body{margin:0;min-height:100%;background:#f5faff}
.watch-static{box-sizing:border-box;min-height:100vh;max-width:440px;margin:0 auto;padding:12%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;font-family:Arial,'Microsoft YaHei',sans-serif;color:#16364f}
.watch-static h1{font-size:18px;line-height:1.4;margin:0 0 8px;color:#16364f}
.watch-static p{font-size:11px;line-height:1.5;margin:0 0 14px;color:#45647b}
.watch-static a{box-sizing:border-box;display:block;width:100%;max-width:280px;padding:14px 8px;border-radius:24px;background:#146aa8;color:#fff;font-size:14px;line-height:20px;font-weight:bold;text-decoration:none;box-shadow:0 4px #0b4d7c}
.watch-static a:active{transform:translateY(3px);box-shadow:0 1px #0b4d7c}
.watch-static a:focus{outline:3px solid #16364f;outline-offset:4px}
.review-booting #watch-download-fallback{display:none}
#review-website-static{display:none}
.review-booting #review-website-static{display:block}
#review-boot-status{display:none;font:16px Arial,sans-serif;text-align:center;padding:40px;color:#16364f}
.review-booting #review-boot-status{display:block}
`;

export function watchDownloadMarkup(release = releaseInfo()) {
  return `<main class="watch-static" id="watch-download-fallback"><h1>Reviewbox Watch</h1><p>${release.version} · Android 11+</p><a id="watch-apk-download" href="${release.url}" download="Reviewbox-Watch-${release.version}.apk">下载手表版 APK</a></main>`;
}

// Runs before any module, stylesheet or app dependency. ES5 only: older watch
// browsers must be able to reach a plain HTML link even if the app cannot parse.
export const watchBootstrap = `(function(){try{var ua=navigator.userAgent||'',s=window.screen||{},w=s.width||0,h=s.height||0;var watch=/(?:^|[?&])watch=1(?:&|$)/.test(location.search||'')||/OWW231|OPPO[ _-]?Watch|ColorOS[ _-]?Watch|Wear[ _-]?OS/i.test(ua)||(/Android/i.test(ua)&&w>=180&&w<=600&&h>=180&&h<=600&&Math.abs(w-h)<=Math.max(w,h)*0.15);if(watch){window.__REVIEW_WATCH_STATIC__=true;location.replace('./watch/?v=6');return;}document.documentElement.className+=' review-booting';}catch(e){}})();`;

export function watchDownloadHtml(release = releaseInfo()) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>下载 Reviewbox Watch</title><style>${watchDownloadStyle}</style></head><body>${watchDownloadMarkup(release)}</body></html>`;
}
