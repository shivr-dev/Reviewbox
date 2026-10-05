import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
function player(kind,pack,snapshot){
 const dom=new JSDOM(readFileSync('public/'+kind+'-player/index.html','utf8'),{url:'https://example.test/'+kind+'-player/index.html',runScripts:'outside-only'}),w=dom.window,messages=[],timers=new Map();let now=100000,idx=0;
 const parent={postMessage:m=>messages.push(structuredClone(m))};Object.defineProperty(w,'parent',{value:parent});w.Date.now=()=>now;w.Math.random=()=>.5;w.scrollTo=()=>{};w.ResizeObserver=class{observe(){}disconnect(){}};
 w.setTimeout=(fn,ms)=>{const id=++idx;timers.set(id,{fn,at:now+ms});return id;};w.clearTimeout=id=>timers.delete(id);w.setInterval=(fn,ms)=>{const id=++idx;timers.set(id,{fn,at:now+ms,repeat:ms});return id;};w.clearInterval=id=>timers.delete(id);
 function receive(type,extra={}){w.dispatchEvent(new w.MessageEvent('message',{source:parent,origin:w.location.origin,data:{channel:'review-'+kind,nonce:'session',type,...extra}}));}
 async function advance(ms){const end=now+ms;for(let guard=0;guard<5000;guard++){const item=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!item)break;const[id,t]=item;now=t.at;if(t.repeat)t.at+=t.repeat;else timers.delete(id);t.fn();await Promise.resolve();await Promise.resolve();}now=end;}
 if(kind==='det')w.eval(readFileSync('public/det-player/icons.js','utf8'));
 w.eval(readFileSync('public/'+kind+'-player/app.js','utf8'));receive('init',{pack,snapshot});
 const click=action=>{const b=w.document.querySelector(kind==='act'?`[data-action="${action}"]`:action);assert.ok(b,action);assert.ok(!b.disabled,action+' enabled');b.click();};
 const latest=()=>messages.filter(m=>m.type==='snapshot').at(-1)?.snapshot;
 return{w,receive,messages,advance,click,latest,close:()=>w.close()};
}
test('ACT source preparation, answer, review, loading, break and final confirmation are connected',async()=>{
 const pack={student:'Kevin',sections:[{id:'eng',name:'English',count:1,minutes:35,breakAfter:300},{id:'writing-custom',name:'Writing',count:1,minutes:40,writing:true}],banks:{eng:[{prompt:'Choose.',passage:'A manually imported paragraph.',choices:['First','Second']}],'writing-custom':[{prompt:'Discuss libraries.',choices:[]}]}};
 const p=player('act',pack,{actVersion:1});try{
  assert.match(p.w.document.body.textContent,/Kevin/);p.click('next');p.click('accept');p.click('next');p.click('next');p.click('next');assert.match(p.w.document.body.textContent,/Choose/);
  const input=p.w.document.querySelector('input[name="answer"]');input.checked=true;input.dispatchEvent(new p.w.Event('change',{bubbles:true}));assert.equal(p.latest().answers['eng:0'],0);
  p.click('next');p.click('end');p.click('confirm-end');await p.advance(4500);assert.equal(p.latest().scene,'break');p.click('continue-section');assert.equal(p.latest().scene,'break');await p.advance(300000);p.click('continue-section');p.click('next');p.click('next');
  const essay=p.w.document.querySelector('.essay');assert.ok(essay);essay.value='A complete essay.';essay.dispatchEvent(new p.w.Event('input',{bubbles:true}));assert.equal(p.latest().answers['writing-custom:0'],'A complete essay.');
  p.click('end');p.click('confirm-end');await p.advance(4500);assert.ok(p.messages.some(m=>m.type==='submit'));assert.equal(p.latest().scene,'submitting');p.receive('submitted');assert.equal(p.latest().scene,'complete');p.click('results');assert.ok(p.messages.some(m=>m.type==='report'));
 }finally{p.close();}
});
const detItem=(route,type,key,extra={})=>({route,type,key,slotId:key,stage:0,index:0,seconds:20,prompt:'Manual task.',passage:'',choices:[],native:{},...extra});
test('Duolingo visits all preparation pages and keeps imported answers until confirmed save',async()=>{
 const pack={student:'Kevin',title:'Manual one-question test',sections:[{name:'Read and Select',frequency:'1',time:5}],items:[detItem('read-select','det_read_select','det:0',{seconds:5,native:{word:'coherent'},choices:['Yes','No']})]};
 const p=player('det',pack,{detVersion:1,cursor:0,route:'home',state:{},answers:{}});try{
  assert.match(p.w.document.body.textContent,/Kevin/);p.click('#submit');assert.match(p.w.document.body.textContent,/Check your equipment/);p.click('#submit');assert.match(p.w.document.body.textContent,/phone camera/);p.click('#submit');assert.match(p.w.document.body.textContent,/Kevin/);p.click('#submit');assert.match(p.w.document.body.textContent,/testing space/);p.click('#submit');
  const agree=p.w.document.querySelector('#agree');agree.checked=true;agree.dispatchEvent(new p.w.Event('change'));p.click('#submit');p.click('#submit');p.click('[data-word-answer="yes"]');await p.advance(120);
  assert.equal(p.latest().answers['det:0'],0);assert.equal(p.latest().cursor,1);assert.equal(p.latest().route,'uploading');assert.ok(p.messages.some(m=>m.type==='submit'));await p.advance(15000);assert.equal(p.latest().route,'uploading');p.receive('submitted');await p.advance(4500);assert.equal(p.latest().route,'complete');p.click('#submit');assert.ok(p.messages.some(m=>m.type==='report'));
 }finally{p.close();}
});
test('Duolingo restores writing text and deadline; cloze is part of the actual route',async()=>{
 const pack={student:'Kevin',title:'Manual test',sections:[{name:'Writing',frequency:'2',time:20}],items:[detItem('writing','det_writing','det:0'),detItem('read-complete','det_read_complete','det:1',{index:1,passage:'The mus{xxx} is open.'})]};
 const p=player('det',pack,{detVersion:1,cursor:0,route:'writing',state:{response:'Saved writing.'},answers:{},deadline:120000});try{
  assert.equal(p.w.document.querySelector('textarea').value,'Saved writing.');assert.equal(p.latest().deadline,120000);p.click('#submit');await Promise.resolve();await Promise.resolve();assert.equal(p.latest().route,'read-complete');assert.equal(p.w.document.querySelectorAll('.letter-cell').length,3);
 }finally{p.close();}
});
test('no production player loads sample questions or writes shared demo storage',()=>{
 for(const kind of ['act','det']){const html=readFileSync('public/'+kind+'-player/index.html','utf8'),js=readFileSync('public/'+kind+'-player/app.js','utf8');assert.ok(!html.includes('src="questions.js"'));assert.ok(!js.includes('localStorage.setItem'));assert.ok(readFileSync('public/'+kind+'-player/preview.html','utf8').includes('preview-app.js'));}
});
test('calculator clears arithmetic errors, supports backspace, and resets graph content',()=>{
 const dom=new JSDOM('<main></main>',{runScripts:'outside-only'}),w=dom.window;
 try{
  const source=readFileSync('public/exam-simulator/app.js','utf8'),calculator=source.slice(source.indexOf('function calculatorModal(){'),source.indexOf('\nfunction referenceModal'));
  w.eval(`const $=s=>document.querySelector(s);function showModal(_,body){document.body.innerHTML=body;} ${calculator};calculatorModal();`);
  const click=v=>w.document.querySelector(`[data-calc="${v}"]`).click(),value=()=>w.document.querySelector('#calcDisplay').value;
  click('9');click('+');click('1');click('=');assert.equal(value(),'10');click('C');assert.equal(value(),'0');click('8');click('9');click('⌫');assert.equal(value(),'8');click('+');click('=');assert.equal(value(),'Error');click('3');assert.equal(value(),'3');click('C');assert.equal(value(),'0');
  for(const file of ['app.js','preview-app.js'])assert.ok(!readFileSync('public/sat-player/'+file,'utf8').includes("SATMath.graph(calcExpression||'x^2')"));
 }finally{w.close();}
});
test('Duolingo recording waits for durable save, and a failed save retries the same audio',async()=>{
 const pack={student:'Kevin',title:'Manual oral test',sections:[{name:'Speaking',frequency:'1',time:90}],items:[detItem('read-speak','det_read_speak','det:0',{seconds:90})]};
 const p=player('det',pack,{detVersion:1,cursor:0,route:'read-speak',state:{},answers:{}});let stopped=false;
 try{
  Object.defineProperty(p.w.navigator,'mediaDevices',{value:{getUserMedia:async()=>({getTracks:()=>[{stop:()=>{stopped=true;}}]})}});
  p.w.Blob=Blob;p.w.MediaRecorder=class{mimeType='audio/webm';start(){this.ondataavailable({data:new Blob(['manual recording'],{type:this.mimeType})});}stop(){queueMicrotask(()=>this.onstop());}};
  p.click('#record');for(let i=0;i<4;i++)await Promise.resolve();p.click('#submit');for(let i=0;i<5;i++)await Promise.resolve();
  const first=p.messages.find(m=>m.type==='recording');assert.ok(first);assert.equal(p.latest().cursor,0);assert.ok(stopped);
  p.receive('recording-saved',{id:first.id,error:'Disk unavailable'});for(let i=0;i<8;i++)await Promise.resolve();assert.ok(p.w.document.querySelector('#retry'));p.click('#retry');for(let i=0;i<6;i++)await Promise.resolve();
  const retry=p.messages.filter(m=>m.type==='recording').at(-1);assert.notEqual(retry.id,first.id);assert.equal(await retry.blob.text(),'manual recording');assert.equal(p.latest().cursor,0);
  p.receive('recording-saved',{id:retry.id});for(let i=0;i<8;i++)await Promise.resolve();assert.equal(p.latest().cursor,1);assert.equal(p.latest().answers['det:0'].recorded,true);
 }finally{p.close();}
});
test('Duolingo stops imported audio when changing tasks and restores replay count',async()=>{
 const pack={student:'Kevin',title:'Manual audio test',sections:[{name:'Listening',frequency:'2',time:60}],items:[detItem('listen-type','det_listen_type','det:0',{audio:'data:audio/mpeg;base64,AA=='}),detItem('read-select','det_read_select','det:1',{native:{word:'coherent'}})]};
 const p=player('det',pack,{detVersion:1,cursor:0,route:'listen-type',state:{plays:1,response:'The library closes.'},answers:{},deadline:120000});let paused=false;
 try{p.w.Audio=class{play(){return Promise.resolve();}pause(){paused=true;}};assert.equal(p.w.document.querySelector('#replays').textContent,'2');p.click('[data-audio="dictation"]');assert.equal(p.w.document.querySelector('#replays').textContent,'1');p.click('#submit');for(let i=0;i<6;i++)await Promise.resolve();assert.ok(paused);assert.equal(p.latest().route,'read-select');}finally{p.close();}
});
