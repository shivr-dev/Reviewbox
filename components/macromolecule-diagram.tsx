'use client';
import {useScientificTargets} from './navi-diagram-control';
import {useEffect,useRef,useState} from 'react';import {createRoot,type Root} from 'react-dom/client';import type {SemanticDiagram} from '@/lib/diagram-spec';import {assetPath} from '@/lib/runtime';import {tr} from '@/lib/i18n';
type Spec=Extract<SemanticDiagram,{kind:'macromolecule'}>;
export default function MacromoleculeDiagram({spec}:{spec:Spec}){
 const queue=useRef(Promise.resolve());
 const host=useRef<HTMLDivElement>(null),pluginRef=useRef<any>(null),[ready,setReady]=useState(false),[error,setError]=useState(''),[snapshot,setSnapshot]=useState(''),[retry,setRetry]=useState(0);
 const controls=useScientificTargets([],ready);
 useEffect(()=>{let cancelled=false,plugin:any,reactRoot:Root|undefined,ro:ResizeObserver|undefined;setReady(false);setError('');setSnapshot('');
  void(async()=>{if(!document.querySelector('link[data-molstar-style]')){const css=document.createElement('link');css.rel='stylesheet';css.href=assetPath('vendor/molstar/molstar.css');css.dataset.molstarStyle='true';document.head.appendChild(css);}
   const [{createPluginUI},{DefaultPluginUISpec},{loadPdb}]=await Promise.all([import('molstar/lib/mol-plugin-ui'),import('molstar/lib/mol-plugin-ui/spec'),import('molstar/lib/extensions/plugin/loaders')]);if(cancelled||!host.current)return;
   plugin=await createPluginUI({target:host.current,render:(element,container)=>{reactRoot=createRoot(container);reactRoot.render(element);},spec:{...DefaultPluginUISpec(),layout:{initial:{isExpanded:false,showControls:false}},components:{remoteState:'none'}}});if(cancelled){plugin.dispose();return;}pluginRef.current=plugin;await loadPdb(plugin,spec.pdbId.toUpperCase());if(cancelled)return;
   if(spec.representation!=='cartoon'){const components=plugin.managers.structure.hierarchy.current.structures.flatMap((s:any)=>s.components);await plugin.managers.structure.component.removeRepresentations(components);await plugin.managers.structure.component.addRepresentation(components,spec.representation==='surface'?'molecular-surface':'ball-and-stick');}
   setReady(true);ro=new ResizeObserver(()=>plugin.layout.events.updated.next(undefined));ro.observe(host.current);const image=await plugin.helpers.viewportScreenshot?.getImageDataUri();if(!cancelled&&image)setSnapshot(image);
  })().catch(e=>{if(!cancelled)setError(e.message);});
  return()=>{cancelled=true;ro?.disconnect();pluginRef.current=null;setTimeout(()=>{reactRoot?.unmount();plugin?.dispose();},0);};
 },[spec.pdbId,spec.representation,retry]);
 useEffect(()=>{if(!ready)return;const plugin=pluginRef.current;if(!plugin)return;
  const model=controls.scientific?.macromolecule??spec.representation;let cancelled=false;
  queue.current=queue.current.catch(()=>{}).then(async()=>{if(cancelled||pluginRef.current!==plugin)return;const components=plugin.managers.structure.hierarchy.current.structures.flatMap((s:any)=>s.components);await plugin.managers.structure.component.removeRepresentations(components);if(cancelled||pluginRef.current!==plugin)return;await plugin.managers.structure.component.addRepresentation(components,model==='surface'?'molecular-surface':model==='ball-stick'?'ball-and-stick':'cartoon');});
  void queue.current.catch(e=>{if(!cancelled)setError(e.message);});return()=>{cancelled=true;};
 },[ready,controls.scientific?.macromolecule,spec.representation]);
 useEffect(()=>{if(!ready)return;const plugin=pluginRef.current,command=controls.scientific?.camera?.command;if(!plugin||!command)return;
  if(command==='reset')plugin.managers.camera.reset(undefined,250);else{const camera=plugin.canvas3d?.camera;if(camera){const snapshot=camera.getSnapshot(),factor=command==='zoom-in'?.8:1.25;const position=snapshot.position.map((v:number,i:number)=>snapshot.target[i]+(v-snapshot.target[i])*factor);plugin.managers.camera.setSnapshot({...snapshot,position},250);}}
 },[ready,controls.scientific?.camera?.revision]);
 async function capture(){try{const image=await pluginRef.current?.helpers.viewportScreenshot?.getImageDataUri();if(image){setSnapshot(image);const a=document.createElement('a');a.href=image;a.download='Reviewbox-'+spec.pdbId+'.png';a.click();}}catch(e){setError((e as Error).message);}}
 return <figure className="diagram molecular-diagram" data-engine="molstar" data-diagram-kind="macromolecule" aria-busy={!ready&&!error}><div ref={host} className="molecular-canvas molstar-host"/>{!ready&&!error&&<p role="status">{tr('common:生物大分子加载中…')}</p>}{error&&<div role="alert"><p>{error}</p><button className="secondary" onClick={()=>setRetry(n=>n+1)}>{tr('common:重试加载')}</button></div>}{snapshot&&<img className="diagram-snapshot" data-diagram-snapshot src={snapshot} alt={spec.caption??'大分子视图快照'} aria-hidden="true"/>}<figcaption><span>{spec.caption} · PDB {spec.pdbId.toUpperCase()} · {spec.source.citation}</span><button className="diagram-export" disabled={!ready} onClick={()=>void capture()}>{tr('common:导出视图快照')}</button></figcaption></figure>;
}
