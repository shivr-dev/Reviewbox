import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {switchAccount,loadData} from '../lib/store';
import {newNaviThread,saveNavi,naviThreads,naviMessages,deleteNavi,type NaviMessage} from '../lib/navi-client';
test('Navi history remains complete, isolates accounts, and tombstones related messages on deletion',async()=>{
 await switchAccount('navi-test-a');const thread=newNaviThread();
 const messages:NaviMessage[]=Array.from({length:75},(_,i)=>({id:'navi-message:'+crypto.randomUUID(),kind:'navi-message',threadId:thread.id,role:i%2?'assistant':'user',text:'Test message '+i,at:new Date(100000+i*1000).toISOString()}));
 await saveNavi(thread,messages,'navi-test-a');
 let data=await loadData();assert.equal(naviThreads(data.jobs).length,1);assert.equal(naviMessages(data.jobs,thread.id).length,75);
 await switchAccount('navi-test-b');data=await loadData();assert.equal(naviThreads(data.jobs).length,0);assert.equal(naviMessages(data.jobs,thread.id).length,0);await assert.rejects(saveNavi(thread,[],'navi-test-a'));
 await switchAccount('navi-test-a');assert.equal(naviMessages((await loadData()).jobs,thread.id).length,75);await deleteNavi(thread.id);data=await loadData();assert.equal(naviThreads(data.jobs).length,0);assert.equal(naviMessages(data.jobs,thread.id).length,0);
});
