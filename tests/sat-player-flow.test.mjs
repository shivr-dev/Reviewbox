import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const html=readFileSync('public/sat-player/index.html','utf8'),script=readFileSync('public/sat-player/app.js','utf8');
function player(snapshot={},random=.5){
  const dom=new JSDOM(html,{url:'https://example.test/sat-player/index.html',runScripts:'outside-only'}),w=dom.window;
  const messages=[],timers=new Map();let now=100000,id=0;
  const parent={postMessage:message=>messages.push(structuredClone(message))};Object.defineProperty(w,'parent',{value:parent});
  w.Date.now=()=>now;w.Math.random=()=>random;w.scrollTo=()=>{};
  w.setTimeout=(fn,ms)=>{const n=++id;timers.set(n,{fn,at:now+ms});return n;};w.clearTimeout=n=>timers.delete(n);
  w.setInterval=(fn,ms)=>{const n=++id;timers.set(n,{fn,at:now+ms,repeat:ms});return n;};w.clearInterval=n=>timers.delete(n);
  function advance(ms){const end=now+ms;for(let guard=0;guard<20000;guard++){const entry=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!entry)break;const [n,t]=entry;now=t.at;if(t.repeat)t.at+=t.repeat;else timers.delete(n);t.fn();}now=end;}
  function receive(type,extra={}){w.dispatchEvent(new w.MessageEvent('message',{source:parent,origin:w.location.origin,data:{channel:'review-sat',nonce:'session',type,...extra}}));}
  const item=(module,text='Choose the main idea.')=>({id:module+':0',prompt:text,passage:'A manually imported passage.',choices:['Answer A','Answer B','Answer C','Answer D'],type:'mcq'});
  const pack={student:'Kevin',date:'October 2, 2026',modules:[{section:'Reading and Writing',number:1,minutes:32,questions:[item('rw1')]},{section:'Reading and Writing',number:2,minutes:32,questions:[]}],sections:{rw1:{questions:[item('rw1')]},rw2_easy:{questions:[item('rw2','Lower route question.')]},rw2_hard:{questions:[item('rw2','Higher route question.')]}}};
  w.eval(script);receive('init',{pack,snapshot:{satVersion:1,route:'login',module:0,index:0,routes:{},times:{},...snapshot}});
  const click=action=>{const button=w.document.querySelector(`[data-action="${action}"]`);assert.ok(button,action+' exists');assert.equal(button.disabled,false,action+' enabled');button.click();};
  const check=()=>{const input=w.document.querySelector('#flow-check');input.checked=true;input.dispatchEvent(new w.Event('change'));};
  const latest=()=>messages.filter(m=>m.type==='snapshot').at(-1)?.snapshot;
  return {w,messages,receive,advance,click,check,latest,random:n=>{random=n;},close:()=>w.close()};
}
test('new SAT login, setup, ticket, check-in, pledge and start-code flow starts the imported paper',()=>{
 const p=player();try{
  assert.equal(p.w.document.querySelector('#demo-name').value,'Kevin');p.click('sign-in');
  assert.match(p.w.document.body.textContent,/Signing You In/);p.advance(4499);assert.match(p.w.document.body.textContent,/Signing You In/);p.advance(1);
  assert.match(p.w.document.body.textContent,/Welcome, Kevin/);p.click('route:setup-device');p.check();p.click('route:setup-info');p.check();p.click('route:setup-rules');p.check();p.click('route:setup-download');
  p.advance(4500);assert.match(p.w.document.body.textContent,/SAT Admission Ticket/);p.click('route:home');p.click('route:check-in');p.check();p.click('route:check-rules');p.check();p.click('route:pledge');
  const pledge=p.w.document.querySelector('#pledge-input');pledge.value=p.w.document.querySelector('.pledge').textContent;pledge.dispatchEvent(new p.w.Event('input'));p.click('route:desk');p.check();p.click('route:start-code');
  for(const input of p.w.document.querySelectorAll('[data-digit]')){input.value='1';input.dispatchEvent(new p.w.Event('input'));}p.click('start-test');
  assert.match(p.w.document.body.textContent,/Preparing Your Practice Test/);p.advance(4500);p.click('dismiss-directions');
  assert.equal(p.w.document.querySelector('.question-text').textContent,'Choose the main idea.');assert.equal(p.latest().remaining,1920);assert.equal(p.w.location.hash,'');
  p.w.document.querySelector('[data-answer="1"]').click();assert.equal(p.latest().answers['rw1:0'],1);
 }finally{p.close();}
});
test('Alt+Esc freezes the timer, Enter resumes and keeps answers, notes and flags',()=>{
 const p=player({started:true,route:'exam',deadline:2020000,answers:{'rw1:0':1},notes:{'rw1:0':'Saved note'},flags:{'rw1:0':true}});
 try{p.advance(1000);p.w.document.dispatchEvent(new p.w.KeyboardEvent('keydown',{key:'Escape',altKey:true,bubbles:true}));assert.equal(p.latest().route,'unscheduled');assert.equal(p.latest().paused,true);const remaining=p.latest().remaining;p.advance(8000);assert.equal(p.latest().remaining,remaining);
 p.w.document.dispatchEvent(new p.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));p.advance(1000);assert.equal(p.latest().remaining,remaining-1);assert.equal(p.latest().answers['rw1:0'],1);assert.equal(p.latest().notes['rw1:0'],'Saved note');assert.equal(p.latest().flags['rw1:0'],true);
 }finally{p.close();}
});
test('Next-ready review confirms locking and waits before requesting adaptive module two',()=>{
 const p=player({started:true,route:'exam',deadline:2020000,extendedReview:true});try{
 p.w.document.querySelector('[data-answer="0"]').click();p.click('next');p.click('review-advance');const input=p.w.document.querySelector('#confirm-module-end');input.checked=true;input.dispatchEvent(new p.w.Event('change',{bubbles:true}));p.click('confirm-module-end');
 assert.match(p.w.document.body.textContent,/This Module Is Over/);p.advance(4499);assert.equal(p.messages.some(m=>m.type==='advance'),false);p.advance(1);assert.ok(p.messages.some(m=>m.type==='advance'));
 p.receive('routed',{route:'hard'});p.click('dismiss-directions');assert.equal(p.w.document.querySelector('.question-text').textContent,'Higher route question.');assert.equal(p.latest().module,1);assert.equal(p.latest().routes.rw2,'hard');assert.equal(p.latest().answers['rw1:0'],0);
 }finally{p.close();}
});
test('20-percent simulated failure retains responses; retry requires durable host confirmation before success',()=>{
 const p=player({module:1,route:'submitting',started:true,answers:{'rw1:0':0,'rw2:0':2},routes:{rw2:'easy'}},.1);try{
 p.advance(3300);assert.match(p.w.document.body.textContent,/Haven’t Been Submitted/);assert.equal(p.messages.some(m=>m.type==='submit'),false);assert.equal(p.latest().answers['rw2:0'],2);p.random(.7);p.click('retry-submit');p.advance(5100);assert.ok(p.messages.some(m=>m.type==='submit'));assert.equal(p.latest().finished,false);assert.match(p.w.document.body.textContent,/Submitting Your Answers/);
 p.receive('submitted');assert.match(p.w.document.body.textContent,/Congratulations/);assert.equal(p.latest().finished,true);p.click('report');assert.ok(p.messages.some(m=>m.type==='report'));
 }finally{p.close();}
});
test('reconnect restores the current module, countdown and lower route without restarting',()=>{
 const p=player({module:1,route:'resume',started:true,deadline:130000,remaining:30,index:0,routes:{rw2:'easy'},answers:{'rw2:0':3}});try{
 p.click('route:exam');assert.equal(p.w.document.querySelector('.question-text').textContent,'Lower route question.');assert.equal(p.w.document.querySelector('[data-answer="3"]').getAttribute('aria-checked'),'true');p.advance(2000);assert.equal(p.latest().remaining,28);
 }finally{p.close();}
});
test('loading waits both 3-second and 6-second endpoints; wrong nonce and origin are ignored',()=>{
 for(const random of [0,.999999]){const p=player({},random);try{p.click('sign-in');const duration=3000+Math.floor(random*3001);p.advance(duration-1);assert.match(p.w.document.body.textContent,/Signing You In/);p.advance(1);assert.match(p.w.document.body.textContent,/Welcome, Kevin/);
 p.w.dispatchEvent(new p.w.MessageEvent('message',{source:p.w.parent,origin:'https://evil.test',data:{channel:'review-sat',nonce:'session',type:'submitted'}}));assert.equal(p.latest().finished,false);
 }finally{p.close();}}
});
test('native host permits form events and SAT bypasses the previous simulator',()=>{
 const host=readFileSync('components/sat-native-room.tsx','utf8');assert.match(host,/sandbox="[^"]*allow-forms/);assert.match(host,/sat-player\/index.html/);const room=readFileSync('components/exam-room.tsx','utf8');assert.ok(room.indexOf('return <SatExamRoom')<room.indexOf('return <NativeExamRoom'));
 assert.doesNotMatch(html,/src="questions.js"/);assert.doesNotMatch(script,/localStorage/);
});
