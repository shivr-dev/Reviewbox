import test from 'node:test';
import assert from 'node:assert/strict';
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import WatchDeviceManager from '../components/watch-device-manager';
import {watchPairingMessage} from '../lib/watch-device-state';

const pairing={id:'pair-1',name:'OWW231',platform:'ColorOS Watch / Android 11',expiresAt:new Date(Date.now()+300000).toISOString(),lastPoll:null};
const device={id:'device-1',name:'OWW231',platform:pairing.platform,lastSeen:new Date().toISOString(),revokedAt:null,notifications:false,history:[]};
const flush=()=>act(async()=>{await new Promise(r=>setTimeout(r,0));});
function click(text:string) {
 const b=[...document.querySelectorAll('button')].find(x=>x.textContent===text);assert.ok(b,'Button missing: '+text);b.click();
}
test('web approval remains visible, refresh failure is honest, and a completed claim becomes a connected device',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 const host=document.createElement('div');document.body.appendChild(host);const root=createRoot(host);
 let approved=false,claimed=false,fail=false;
 const request=async(action:string)=>{
  if(action==='inspect')return pairing;
  if(action==='approve'){approved=true;fail=true;return {...pairing,approved:true,pairingId:pairing.id};}
  if(action==='list'){if(fail){fail=false;throw Error('网络暂时中断');}return {devices:claimed?[device]:[],pairings:approved&&!claimed?[pairing]:[]};}
  throw Error('Unexpected action '+action);
 };
 try {
  await act(async()=>root.render(<WatchDeviceManager request={request}/>));await flush();
  const input=host.querySelector('input')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')!.set!.call(input,'ABCD EFGH');input.dispatchEvent(new window.Event('input',{bubbles:true}));});
  await act(async()=>click('核对设备'));await flush();
  await act(async()=>click('确认授权'));await flush();
  assert.match(host.textContent!,/等待手表连接/);assert.match(host.textContent!,/授权已保存/);assert.match(host.textContent!,/网络暂时中断/);
  assert.doesNotMatch(host.textContent!,/OWW231已连接/);
  await act(async()=>click('重试'));await flush();
  assert.match(host.textContent!,/手表尚未检查授权/);
  claimed=true;
  await act(async()=>click('刷新'));await flush();
  assert.equal(host.querySelector('[aria-label="待完成的配对"]'),null);assert.match(host.textContent!,/OWW231 已连接/);
 } finally {await act(async()=>root.unmount());host.remove();}
});
test('expired approval never claims connection success',()=>{
 assert.match(watchPairingMessage({...pairing,expiresAt:'2020-01-01T00:00:00Z'}),/配对已过期/);
 assert.match(watchPairingMessage({...pairing,lastPoll:new Date().toISOString()}),/等待手表完成连接/);
});

test('revoked devices stay out of connected list; failed unbind preserves the row and successful unbind removes it even if refresh fails',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 const host=document.createElement('div');document.body.appendChild(host);const root=createRoot(host);
 let revoked=false,failRevoke=true,failRefresh=false;
 const request=async(action:string,body?:any)=>{
  if(action==='list'){
   if(failRefresh){failRefresh=false;throw Error('刷新暂时失败');}
   return {devices:[{...device,name:'旧手表',id:'old-device',revokedAt:'2026-10-24T00:00:00Z'}, {...device,revokedAt:revoked?'2026-10-25T00:00:00Z':null}],pairings:[]};
  }
  if(action==='revoke'){
   assert.equal(body.deviceId,device.id);
   if(failRevoke){failRevoke=false;throw Error('解绑暂时失败');}
   revoked=true;failRefresh=true;return {ok:true};
  }
  throw Error('Unexpected action '+action);
 };
 try {
  await act(async()=>root.render(<WatchDeviceManager request={request}/>));await flush();
  assert.doesNotMatch(host.textContent!,/旧手表/);assert.equal(host.querySelectorAll('article.watch-device-row').length,1);
  await act(async()=>click('解绑'));await act(async()=>click('确认解绑'));await flush();
  assert.match(host.textContent!,/解绑暂时失败/);assert.equal(host.querySelectorAll('article.watch-device-row').length,1);
  await act(async()=>click('确认解绑'));await flush();
  assert.match(host.textContent!,/已解绑/);assert.match(host.textContent!,/刷新暂时失败/);assert.equal(host.querySelectorAll('article.watch-device-row').length,0);
  assert.equal(host.querySelector('[role="alertdialog"]'),null);
  await act(async()=>click('重试'));await flush();
  assert.equal(host.querySelectorAll('article.watch-device-row').length,0);assert.match(host.textContent!,/还没有连接的手表/);
 }finally {await act(async()=>root.unmount());host.remove();}
});
