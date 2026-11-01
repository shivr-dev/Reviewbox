'use client';
import {useId,useRef} from 'react';
import {tr} from '@/lib/i18n';
import type {SemanticDiagram} from '@/lib/diagram-spec';
import type {DiagramStage} from '@/lib/shaded-regions';
import {downloadDiagram,PRINT_FONT} from '@/lib/math-svg';
import MeasurementDrawing from './scientific/measurement';
import {WaveDrawing,MotionDrawing} from './scientific/charts';
import {ForceDrawing,LeverDrawing,BuoyancyDrawing,CartDrawing} from './scientific/mechanics';
import StatisticsDrawing from './scientific/statistics';
import BiologyDrawing from './scientific/biology';
import DiagramExport from './diagram-export';
export function ScientificDrawing({spec,stage='question',id}:{spec:SemanticDiagram;stage?:DiagramStage;id:string}){
 if(spec.kind==='statistics')return <StatisticsDrawing spec={spec} id={id}/>;
 if(spec.kind==='biology')return <BiologyDrawing spec={spec} id={id} stage={stage}/>;
 switch(spec.kind){case 'measurement':return <MeasurementDrawing spec={spec} stage={stage}/>;case 'wave':return <WaveDrawing spec={spec} id={id}/>;case 'motion':return <MotionDrawing spec={spec} id={id}/>;case 'forces':return <ForceDrawing spec={spec} id={id}/>;case 'lever':return <LeverDrawing spec={spec} id={id} stage={stage}/>;case 'buoyancy':return <BuoyancyDrawing spec={spec} id={id} stage={stage}/>;case 'experiment':return spec.setup==='inclined_cart'?<CartDrawing spec={spec}/>:null;default:return null;}
}
export default function ScientificDiagram({spec,stage='question'}:{spec:SemanticDiagram;stage?:DiagramStage}){
 const id='science'+useId().replace(/[^a-z0-9]/gi,''),ref=useRef<SVGSVGElement>(null);
 return <figure className="diagram publication-diagram science-diagram" data-engine="reviewbox-svg" data-diagram-kind={spec.kind}><svg ref={ref} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 360" role="img" aria-label={spec.caption??spec.kind} fontFamily={PRINT_FONT}><defs><marker id={id+'-arrow'} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 1L7 4L0 7" fill="none" stroke="#202020" strokeWidth="1.2"/></marker></defs><rect width={600} height={360} fill="white"/><g fill="none" stroke="#202020" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round"><ScientificDrawing spec={spec} stage={stage} id={id}/></g></svg><figcaption><span>{spec.caption}{spec.mode==='schematic'?' · '+tr('common:定性示意（非数值比例）'):''}</span><DiagramExport getSvg={()=>ref.current} name={'Reviewbox-'+spec.kind+'-'+stage}/></figcaption></figure>;
}
