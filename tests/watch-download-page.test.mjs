import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {watchBootstrap,watchDownloadHtml,releaseInfo} from '../scripts/watch-download-page.mjs';

function boot(userAgent,width,height,search='') {
  const redirects=[],document={documentElement:{className:''}},window={screen:{width,height}};
  vm.runInNewContext(watchBootstrap,{navigator:{userAgent},window,document,location:{search,replace:url=>redirects.push(url)},URLSearchParams:undefined,Promise:undefined,fetch:undefined,AbortController:undefined});
  return {redirects,document,window};
}
test('old watch browsers reach a static download before any modern app code',()=>{
  for(const ua of ['Mozilla/5.0 (Linux; Android 11; OWW231) AppleWebKit/537.36','Mozilla/5.0 (Linux; Android 11) Chrome/70.0']){
    const result=boot(ua,454,454);assert.deepEqual(result.redirects,['./watch/?v=6']);
    assert.equal(result.window.__REVIEW_WATCH_STATIC__,true);assert.equal(result.document.documentElement.className,'');
  }
  assert.deepEqual(boot('desktop',1920,1080,'?watch=1').redirects,['./watch/?v=6']);
  assert.deepEqual(boot('Android 11; OWW231',454,400).redirects,['./watch/?v=6']);
});
test('desktop and ordinary phones keep the learning application',()=>{
  for(const [ua,w,h] of [['desktop',1920,1080],['Android 11; Pixel',412,915]]){
    const result=boot(ua,w,h);assert.deepEqual(result.redirects,[]);assert.match(result.document.documentElement.className,/review-booting/);
  }
});
test('download works with JavaScript disabled and no stylesheet or API requests',()=>{
  const html=watchDownloadHtml(),doc=new JSDOM(html).window.document;
  assert.equal(doc.querySelectorAll('script,link[rel=stylesheet]').length,0);
  assert.equal(doc.querySelectorAll('a').length,1);
  assert.equal(doc.querySelector('a').getAttribute('href'),releaseInfo().url);
  assert.equal(doc.querySelector('a').textContent,'下载手表版 APK');
  assert.match(html,/min-height:100vh/);assert.doesNotMatch(html,/100dvh|fetch\(|type="module"/);
});
test('built root and dedicated watch route both contain the verified direct APK link',async()=>{
  for(const file of ['pages-dist/index.html','pages-dist/watch/index.html']){
    const html=await readFile(file,'utf8');assert.ok(html.includes(releaseInfo().url));
    assert.match(html,/id="watch-apk-download"/);
  }
  const root=await readFile('pages-dist/index.html','utf8');
  assert.ok(root.indexOf('__REVIEW_WATCH_STATIC__')<root.indexOf('type="module"'));
});
