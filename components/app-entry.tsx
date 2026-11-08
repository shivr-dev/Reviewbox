'use client';
import {lazy, Suspense, useEffect, useState} from 'react';
import {openDB} from 'idb';
import WebsiteView from './website-view';
import WorkspaceLoading from './workspace-loading';
import {workspaceHash} from '@/lib/workspace-route';
const Workspace = lazy(() => import('../app/workspace'));
const systemRoute = () => typeof location !== 'undefined' && !!location.hash && !['#website', '#home'].includes(location.hash);

async function returningLearner() {
  // Read only the current namespace. Do not create, migrate or seed a database on the website.
  const db = await openDB('review-learning-v1', 1, {upgrade(_db,_old,_new,tx){tx.abort();}});
  try {
    const ns = await db.get('meta','activeAccount') ?? 'local';
    const tx = db.transaction('records');
    let cursor = await tx.store.openCursor(IDBKeyRange.bound(ns+'/',ns+'/\uffff'));
    while(cursor){
      const r = cursor.value;
      if(!r.deleted && r.namespace===ns && (
        ['event','question','test','exam','note','material'].includes(r.kind) ||
        (r.kind==='setting' && r.payload?.assistant?.onboardedAt) ||
        (r.kind==='job' && ['course','session','assessment','exam-run','remediation'].includes(r.payload?.kind))
      )) return true;
      cursor = await cursor.continue();
    }
    return false;
  } finally {db.close();}
}
export default function AppEntry(){
  const [system,setSystem] = useState(systemRoute);
  useEffect(()=>{
    let active=true;
    const route=()=>{if(location.hash==='#website')setSystem(false);else if(systemRoute())setSystem(true);else void returningLearner().then(found=>{if(active)setSystem(found);}).catch(()=>{});};
    route(); window.addEventListener('hashchange',route);window.addEventListener('popstate',route);
    return()=>{active=false;window.removeEventListener('hashchange',route);window.removeEventListener('popstate',route);};
  },[]);
  function navigate(page:string,subject='all',section=''){
    history.pushState(null,'',workspaceHash({page,subject,section}));setSystem(true);window.scrollTo(0,0);
  }
  return system ? <Suspense fallback={<WorkspaceLoading/>}><Workspace/></Suspense> : <WebsiteView navigate={navigate}/>;
}
