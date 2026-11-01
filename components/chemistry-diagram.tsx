'use client';
import {lazy,Suspense,useEffect,useRef,useState} from 'react';
import {tr} from '@/lib/i18n';import type {DiagramStage} from '@/lib/shaded-regions';
import {validateChemicalDiagram,safeChemicalSvg,type ChemicalSpec} from '@/lib/chemical-engine';
import {visiblePhase} from '@/lib/diagram-registry';import DiagramExport from './diagram-export';
const Molecule3D=lazy(()=>import('./molecule-3d'));
export default function ChemistryDiagram({spec,stage='question'}:{spec:ChemicalSpec;stage?:DiagramStage}){
 const host=useRef<HTMLDivElement>(null),[result,setResult]=useState<Awaited<ReturnType<typeof validateChemicalDiagram>>>(),[error,setError]=useState('');
 const signature=JSON.stringify(spec);
 useEffect(()=>{let cancelled=false;setResult(undefined);setError('');if(spec.view==='molecule3d')return;void validateChemicalDiagram(spec).then(value=>{if(!cancelled){if(spec.view==='structure2d'&&host.current)host.current.innerHTML=safeChemicalSvg(value.svg);setResult(value);}}).catch(e=>{if(!cancelled)setError(e.message);});return()=>{cancelled=true;host.current?.replaceChildren();};},[signature]);
 if(spec.view==='molecule3d')return <Suspense fallback={<p role="status">{tr('common:三维引擎加载中…')}</p>}><Molecule3D spec={spec}/></Suspense>;
 return <figure className="diagram publication-diagram chemical-diagram" data-engine="rdkit" data-diagram-kind="chemistry" aria-busy={!result&&!error} data-validation={result?'engine-valid':'pending'}>{!result&&!error&&<p role="status">{tr('common:化学结构加载中…')}</p>}{error&&<p role="alert">{error}</p>}<div ref={host} className="chemical-svg-host"/>{result&&spec.showProperties&&visiblePhase(spec.propertiesPhase,stage)&&<p className="chemical-properties">{tr('common:分子式')}：{result.formula} · {tr('common:相对分子质量')}：{Number(result.mass.toFixed(4))}</p>}<figcaption><span>{spec.caption}</span><DiagramExport getSvg={()=>host.current?.querySelector('svg')} name="Reviewbox-chemical-structure" disabled={!result}/></figcaption></figure>;
}
