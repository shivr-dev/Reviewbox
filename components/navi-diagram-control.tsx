'use client';
import {createContext,useContext,useEffect,useMemo,useSyncExternalStore} from 'react';
import {NaviUIController,registerNaviUI} from '@/lib/navi-ui';
import type {WorkspaceLayout} from '@/lib/navi-ui';
export const NaviDiagramContext=createContext<{zoom:number;molecule?:'ball-stick'|'spacefill'|'surface';scientific?:WorkspaceLayout['scientific'];controller?:NaviUIController}>({zoom:1});
export const useNaviDiagram=()=>useContext(NaviDiagramContext);
const resources=new WeakMap<NaviUIController,{ids:Map<string,number>;macro:number;base:string[];baseMacro:boolean}>();
/** Register only objects actually rendered at the current disclosure stage. */
export function useScientificTargets(ids:string[],macromolecule=false){
 const context=useNaviDiagram();const signature=JSON.stringify(ids);
 const own=useMemo(()=>new NaviUIController({panels:['diagram'],questionIds:[],molecule:false,protected:false}),[]);
 const controller=context.controller??own;
 useEffect(()=>{
  let resource=resources.get(controller);if(!resource){resource={ids:new Map(),macro:0,base:[...(controller.capabilities.scientificIds??[])],baseMacro:!!controller.capabilities.macromolecule};resources.set(controller,resource);}
  for(const id of ids)resource.ids.set(id,(resource.ids.get(id)??0)+1);if(macromolecule)resource.macro++;
  const update=()=>{controller.capabilities={...controller.capabilities,scientificIds:[...new Set([...resource!.base,...resource!.ids.keys()])],macromolecule:resource!.baseMacro||resource!.macro>0};};update();
  const unregister=context.controller?undefined:registerNaviUI(controller,0);
  return()=>{for(const id of ids){const n=(resource!.ids.get(id)??1)-1;if(n)resource!.ids.set(id,n);else resource!.ids.delete(id);}if(macromolecule)resource!.macro--;update();unregister?.();};
 },[controller,signature,macromolecule]);
 const state=useSyncExternalStore(own.subscribe,own.snapshot,own.snapshot);
 return context.controller?context:{...context,scientific:state.scientific,zoom:state.zoom,controller:own};
}
