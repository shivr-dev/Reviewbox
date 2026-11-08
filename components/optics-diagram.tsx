'use client';
import {useScientificTargets} from './navi-diagram-control';

import DiagramExport from './diagram-export';
import {tr} from '@/lib/i18n';
import {useId,useMemo,useRef} from 'react';
import type {SemanticDiagram} from '@/lib/diagram-spec';
import type {DiagramStage} from '@/lib/shaded-regions';
import {traceOptics,type OpticsSegment} from '@/lib/ray-optics-adapter';
import {OpticsSpecialDrawing} from './scientific/optics-special';
import {downloadDiagram,printProjection,publicationLabels,PRINT_FONT,type XY} from '@/lib/math-svg';
type Spec=Extract<SemanticDiagram,{kind:'optics'}>;
export function opticsVisibility(spec:Spec,stage:DiagramStage){
 const visible=(phase:DiagramStage|undefined)=>!phase||phase==='question'||phase===stage||stage==='solution';
 return {image:spec.showImage&&visible(spec.imagePhase??'solution'),rays:spec.showRays&&visible(spec.raysPhase??'solution')};
}
/** Liang-Barsky clipping keeps rays directed and finite without moving their intersections. */
function clip(segment:OpticsSegment,b:[number,number,number,number]):[XY,XY]|null{
 let lo=0,hi=1;const a=segment.from,dx=segment.to.x-a.x,dy=segment.to.y-a.y;
 for(const [p,q]of [[-dx,a.x-b[0]],[dx,b[2]-a.x],[-dy,a.y-b[1]],[dy,b[3]-a.y]]){if(p===0){if(q<0)return null;continue;}const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi)return null;}
 return [[a.x+lo*dx,a.y+lo*dy],[a.x+hi*dx,a.y+hi*dy]];
}
export function OpticsDrawing(props:{spec:Spec;stage?:DiagramStage;id:string}){return props.spec.view==='parallel'||props.spec.view==='reflection'?<OpticsSpecialDrawing {...props} stage={props.stage??'question'}/>:<TraceOpticsDrawing {...props}/>;}
function TraceOpticsDrawing({spec,stage='question',id}:{spec:Spec;stage?:DiagramStage;id:string}){

 const f=spec.focalLength??1,u=spec.objectDistance??4,h=spec.objectHeight??f*.3;
 const trace=traceOptics({...spec,lens:spec.lens??'convex',focalLength:f,objectDistance:u,objectHeight:h}),visibility=opticsVisibility(spec,stage),isInterface=spec.opticalElement==='interface',isMirror=spec.opticalElement==='mirror';
 const controls=useScientificTargets(visibility.rays?trace.rays.map(ray=>'ray:'+ray.id):[]);
 const known:XY[]=isInterface?[[-4,-2.8],[4,2.8]]:[[-u,0],[-u,h],[0,-h],[0,h]];
 if(!isInterface&&!isMirror)known.push([-2*f,0],[2*f,0]);
 if(visibility.image&&trace.image)known.push([trace.image.tip.x,trace.image.tip.y],[trace.image.base.x,trace.image.base.y]);
 const span=Math.max(...known.map(p=>p[0]))-Math.min(...known.map(p=>p[0])),vertical=Math.max(h*1.6,span*.19);
 const bounds:[number,number,number,number]=[Math.min(...known.map(p=>p[0]))-span*.09,Math.min(...known.map(p=>p[1]),-vertical)-h*.2,Math.max(...known.map(p=>p[0]))+span*.09,Math.max(...known.map(p=>p[1]),vertical)+h*.2];
 const {project:p}=printProjection(bounds,600,340,37),origin=p([0,0]),obstacles:XY[][]=[],labels:{x:number;y:number;text:string;italic?:boolean}[]=[];
 const label=(at:XY,text:string,italic=true)=>{const [x,y]=p(at);labels.push({x,y,text,italic});};
 const line=(a:XY,b:XY,dashed=false,key?:string)=>{const start=p(a),end=p(b);obstacles.push([start,end]);return <line key={key} x1={start[0]} y1={start[1]} x2={end[0]} y2={end[1]} strokeDasharray={dashed?'6 4':undefined}/>;};
 const arrow=(a:XY,b:XY,key:string,dashed=false)=>{const start=p(a),end=p(b);return <g key={key}>{line(a,b,dashed)}<line x1={start[0]} y1={start[1]} x2={end[0]} y2={end[1]} markerEnd={`url(#${id}-arrow)`} strokeDasharray={dashed?'6 4':undefined}/></g>;};
 const rays=visibility.rays?trace.rays.flatMap(ray=>ray.segments.map((s,i)=>{
  const clipped=clip(s,bounds);if(!clipped)return null;const [a,b]=clipped,start=p(a),end=p(b),dx=end[0]-start[0],dy=end[1]-start[1],len=Math.hypot(dx,dy),at=[start[0]+dx*.58,start[1]+dy*.58],angle=Math.atan2(dy,dx)*180/Math.PI;
  return <g key={ray.id+i} data-ray-id={ray.id} style={controls.scientific?.highlights.includes('ray:'+ray.id)?{stroke:'#1263a8',strokeWidth:2.8}:undefined}>{line(a,b,s.virtual)}{!s.virtual&&len>24&&<path d="M-5 -3 L1 0 L-5 3" fill="none" transform={`translate(${at}) rotate(${angle})`}/>}</g>;
 })):null;
 const elements=[];
 if(isInterface){
  elements.push(line([0,bounds[1]],[0,bounds[3]],false,'interface'),line([bounds[0],0],[bounds[2],0],true,'normal'));
  label([-2.5,2.25],`n₁ = ${spec.refractiveIndex1}`,false);label([1,2.25],`n₂ = ${spec.refractiveIndex2}`,false);label([0,0],'O');
  // Incidence is a stated condition. Outgoing angle remains hidden with solution rays.
  if(visibility.rays){const angle=(spec.incidenceAngle??0)*Math.PI/180,rx=30,arc=`M${origin[0]-rx},${origin[1]} A${rx},${rx} 0 0 ${angle>=0?1:0} ${origin[0]-rx*Math.cos(angle)},${origin[1]+rx*Math.sin(angle)}`;elements.push(<path key="angle" d={arc} fill="none"/>);labels.push({x:origin[0]-45,y:origin[1]+Math.sign(angle||1)*15,text:`${Math.abs(spec.incidenceAngle??0)}°`,italic:false});}
 }else{
  elements.push(line([bounds[0],0],[bounds[2],0],true,'axis'));label([0,0],'O');
  if(isMirror){const angle=(spec.mirrorAngle??90)*Math.PI/180,t=[Math.cos(angle),Math.sin(angle)],length=Math.max(h*1.8,vertical);elements.push(line([-t[0]*length,-t[1]*length],[t[0]*length,t[1]*length],false,'mirror'));
   for(let i=-5;i<=5;i++){const at=[t[0]*length*i/5,t[1]*length*i/5],a=p(at as XY),n=[-t[1]*8,t[0]*-8];elements.push(<line key={'hatch'+i} x1={a[0]} y1={a[1]} x2={a[0]-n[0]+t[0]*5} y2={a[1]+n[1]-t[1]*5} strokeWidth=".8"/>);}
  }else{
   const height=vertical*.9,a=p([0,height]),b=p([0,-height]);elements.push(<g key="lens" strokeWidth="1.65"><line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]}/><path d={spec.lens==='concave'?`M${a[0]-5} ${a[1]-6} L${a[0]} ${a[1]} L${a[0]+5} ${a[1]-6} M${b[0]-5} ${b[1]+6} L${b[0]} ${b[1]} L${b[0]+5} ${b[1]+6}`:`M${a[0]-5} ${a[1]+6} L${a[0]} ${a[1]} L${a[0]+5} ${a[1]+6} M${b[0]-5} ${b[1]-6} L${b[0]} ${b[1]} L${b[0]+5} ${b[1]-6}`} fill="none"/></g>);
   for(const n of [-2,-1,1,2]){const xy=p([n*f,0]);elements.push(<circle key={'f'+n} cx={xy[0]} cy={xy[1]} r="1.8" fill="#222" stroke="none"/>);label([n*f,0],Math.abs(n)===2?'2F':'F');}
  }
  elements.push(arrow([-u,0],[-u,h],'object'));label([-u,h],'A');label([-u,0],'B');
  if(visibility.image&&trace.image){const im=trace.image;elements.push(arrow([im.base.x,im.base.y],[im.tip.x,im.tip.y],'image',im.virtual));label([im.tip.x,im.tip.y],'A′');label([im.base.x,im.base.y],'B′');}
  if(spec.view==='apparatus'){const rail=bounds[1]*.5;elements.push(line([bounds[0],rail],[bounds[2],rail],false,'rail'),line([-u,0],[-u,rail],false,'candle-stand'),line([0,-vertical*.9],[0,rail],false,'lens-stand'));}
  if(spec.showDistances){label([-u/2,bounds[1]*.75],`u = ${u}${spec.unit?' '+spec.unit:''}`,false);if(visibility.image&&trace.image&&(!isMirror||spec.mirrorAngle===undefined||spec.mirrorAngle===90))label([trace.image.distance/2,bounds[1]*.75],`v = ${Number(trace.image.distance.toPrecision(5))}${spec.unit?' '+spec.unit:''}`,false);}
 }
 const text=publicationLabels(labels,obstacles,600,340);
 return <><defs><marker id={id+'-arrow'} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 1 L7 4 L0 7" fill="none" stroke="#222" strokeWidth="1.2"/></marker><clipPath id={id+'-clip'}><rect x="20" y="18" width="560" height="304"/></clipPath></defs><rect width="600" height="340" fill="white"/><g fill="none" stroke="#222" strokeWidth="1.25" clipPath={`url(#${id}-clip)`}>{elements}{rays}</g><g dangerouslySetInnerHTML={{__html:text}}/></>;
}
export default function OpticsDiagram({spec,stage='question'}:{spec:Spec;stage?:DiagramStage}){
 const ref=useRef<SVGSVGElement>(null),id='optics'+useId().replace(/[^a-z0-9]/gi,'');
 const drawing=useMemo(()=>{try{return {content:<OpticsDrawing spec={spec} stage={stage} id={id}/>};}catch(e){return {error:(e as Error).message};}},[spec,stage,id]);
 return <figure className="diagram publication-diagram" data-engine="ray-optics" data-diagram-kind="optics">{drawing.error?<p role="alert">{tr("common:光路条件需要确认：")}{drawing.error}</p>:<svg ref={ref} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 340" role="img" aria-label={spec.caption??'光路图'} fontFamily={PRINT_FONT}>{drawing.content}</svg>}<figcaption><span>{spec.caption}{!spec.objectHeight&&spec.view!=='parallel'&&spec.view!=='reflection'&&spec.opticalElement!=='interface'?' · '+tr('common:物体高度仅作示意'):''}</span><DiagramExport getSvg={()=>ref.current} name={'Reviewbox-optics-'+stage} disabled={!!drawing.error}/></figcaption></figure>;
}
