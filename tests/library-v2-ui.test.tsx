import test from 'node:test';import assert from 'node:assert/strict';import {act,useState} from 'react';import {createRoot} from 'react-dom/client';
import {ReviewContext} from '../components/review-context';import Library from '../components/library-view';import PackUpdateReview from '../components/pack-update-review';
import {corePack} from '../lib/seed';import {installPack,loadData,put,switchAccount,allRecords} from '../lib/store';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
function fixture(){const n={...corePack.knowledge[0],id:'ui:n'},q={...corePack.questions.find(q=>q.nodeId===corePack.knowledge[0].id)!,id:'ui:q',nodeId:n.id};return {schemaVersion:1 as const,manifest:{...corePack.manifest,id:'ui-pack',title:'我的语文包',version:'1'},knowledge:[n],questions:[q]};}
async function mount(component:any){const host=document.createElement('div');document.body.appendChild(host);const root=createRoot(host);const initial=await loadData();function Harness(){const [data,setData]=useState(initial);return <ReviewContext.Provider value={{data,refresh:async()=>setData(await loadData()),subject:'all',notify:()=>{},start:()=>{},cloudUser:null,navigate:()=>{}} as any}>{component}</ReviewContext.Provider>;}await act(async()=>{root.render(<Harness/>);await new Promise(r=>setTimeout(r,20));});return {host,close:async()=>{await act(()=>root.unmount());host.remove();}};}
test('library defaults to owned content, has three main tabs and no legacy sample install action',async()=>{
 await switchAccount('library-ui');await installPack(fixture());const view=await mount(<Library initialTab="content"/>);
 try{assert.deepEqual([...view.host.querySelectorAll('[role=tab]')].map(e=>e.textContent),['学习资料','题目库','学习包']);assert.ok(view.host.textContent?.includes('我的语文包'));assert.ok(!view.host.textContent?.includes('多学科基础学习包'));assert.equal([...view.host.querySelectorAll('button')].filter(e=>e.textContent==='导入').length,1);
 const devices=[...view.host.querySelectorAll('button')].find(e=>e.textContent==='设备同步')!;await act(()=>devices.click());assert.ok(view.host.textContent?.includes('我的学习包 · 带到手表'));assert.ok(!view.host.textContent?.includes('公共学习包'));
 }finally{await view.close();}
});
test('version diff blocks conflicts until explicitly resolved, commits through the real store and displays results',async()=>{
 const p=fixture();await put('question',{...p.questions[0],prompt:'我自己的修改',verified:true});const next={...p,manifest:{...p.manifest,version:'2'},questions:[{...p.questions[0],prompt:'新版题干'}]};
 const view=await mount(<PackUpdateReview pack={next} onDone={()=>{}} onCancel={()=>{}}/>);
 try{await act(async()=>{await new Promise(r=>setTimeout(r,40));});const button=[...view.host.querySelectorAll('button')].find(e=>e.textContent==='确认更新')!;assert.ok(button.disabled);assert.ok(view.host.textContent?.includes('我自己的修改'));assert.ok(view.host.textContent?.includes('新版题干'));
 const label=[...view.host.querySelectorAll('label')].find(e=>e.textContent?.includes('使用新版内容'))!;await act(()=>label.querySelector('input')!.click());assert.equal(button.disabled,false);await act(async()=>{button.click();await new Promise(r=>setTimeout(r,40));});assert.match(view.host.textContent!,/已完成：新增 0 题，修改 1 题/);assert.equal((await allRecords()).find(r=>r.id==='ui:q')!.payload.verified,false);
 }finally{await view.close();}
});
test('installed package pagination and search reach content beyond the first page',async()=>{
 for(let i=0;i<14;i++){const p=fixture();p.manifest={...p.manifest,id:'page-'+i,title:'测试包'+String(i).padStart(2,'0')};p.knowledge=[{...p.knowledge[0],id:'page-node-'+i}];p.questions=[{...p.questions[0],id:'page-question-'+i,nodeId:p.knowledge[0].id}];await installPack(p);}
 const view=await mount(<Library initialTab="content"/>);try{
  const next=[...view.host.querySelectorAll('button')].find(b=>b.textContent==='下一页')!;assert.equal(next.disabled,false);await act(()=>next.click());assert.ok(view.host.textContent?.includes('测试包13'));
  const input=view.host.querySelector('input[aria-label="搜索学习包"]') as HTMLInputElement;
  await act(()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')!.set!.call(input,'测试包03');input.dispatchEvent(new window.Event('input',{bubbles:true}));});
  assert.ok(view.host.textContent?.includes('测试包03'));assert.ok(!view.host.textContent?.includes('测试包13'));
 }finally{await view.close();}
});
