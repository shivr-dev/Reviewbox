'use client';
import {useEffect,useState} from 'react';import type {SemanticDiagram} from '@/lib/diagram-spec';import ScientificDiagram from './scientific-diagram';import {tr} from '@/lib/i18n';
type Spec=Extract<SemanticDiagram,{kind:'biology'}>;
/** Cytoscape owns the graph and layout. Reviewbox prints those exact positions
 * as SVG, preserving editable vector export without adding a second network engine. */
export default function BiologyNetwork({spec}:{spec:Spec}){const [layout,setLayout]=useState<Spec>(),[error,setError]=useState('');const signature=JSON.stringify(spec);
 useEffect(()=>{let cancelled=false,cy:import('cytoscape').Core|undefined;setLayout(undefined);setError('');void import('cytoscape').then(({default:cytoscape})=>{if(cancelled)return;cy=cytoscape({headless:true,elements:[...spec.nodes!.map(n=>({data:{id:n.id,label:n.label},position:{x:n.x*450,y:n.y*220}})),...spec.links!.map((l,i)=>({data:{id:'edge-'+i,source:l.from,target:l.to}}))],layout:{name:'preset'}});cy.layout({name:'preset',positions:Object.fromEntries(spec.nodes!.map(n=>[n.id,{x:n.x*450,y:n.y*220}]))}).run();const nodes=spec.nodes!.map(n=>{const p=cy!.getElementById(n.id).position();if(!Number.isFinite(p.x)||!Number.isFinite(p.y))throw new Error('关系图布局无效');return {...n,x:p.x/450,y:p.y/220};});if(!cancelled)setLayout({...spec,nodes});}).catch(e=>{if(!cancelled)setError(e.message);});return()=>{cancelled=true;cy?.destroy();};},[signature]);
 return <div data-engine="cytoscape" data-diagram-kind="biology-network">{error?<p role="alert">{error}</p>:layout?<ScientificDiagram spec={layout}/>:<p role="status" aria-busy="true">{tr('common:关系图加载中…')}</p>}</div>;
}

