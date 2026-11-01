import type {SemanticDiagram} from '@/lib/diagram-spec';
import type {DiagramStage} from '@/lib/shaded-regions';
import {traceReflection,traceParallelLens} from '@/lib/ray-optics-adapter';
import {visiblePhase} from '@/lib/diagram-registry';
import {ScienceText,Arrow} from './primitives';
type Spec=Extract<SemanticDiagram,{kind:'optics'}>;
export function OpticsSpecialDrawing({spec:s,id,stage}:{spec:Spec;id:string;stage:DiagramStage}){
 const parallel=s.view==='parallel',rays=parallel?traceParallelLens(s.lens??'convex',s.focalLength!):[],out=visiblePhase(s.raysPhase??'solution',stage)&&s.showRays;
 const f=s.focalLength??1,scale=85/f,px=(x:number)=>300+x*scale,py=(y:number)=>170-y*scale;
 return <><defs><marker id={id+'-arrow'} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 1L7 4L0 7" fill="none" stroke="#222"/></marker></defs><rect width={600} height={340} fill="white"/><g fill="none" stroke="#222" strokeWidth={1.5}>{parallel?<><path d="M60 170H550" strokeDasharray="6 4"/><path d="M300 65V275"/><path d={s.lens==='concave'?'M294 59L300 65L306 59 M294 281L300 275L306 281':'M294 71L300 65L306 71 M294 269L300 275L306 269'}/>{[-1,1].map(n=><g key={n}><circle cx={px(n*f)} cy={170} r={2} fill="#222"/><ScienceText x={px(n*f)} y={196} anchor="middle" italic>F</ScienceText></g>)}{rays.map((ray,i)=><g key={i}><Arrow x={px(ray.incident.from.x)} y={py(ray.incident.from.y)} dx={px(0)-px(ray.incident.from.x)} dy={0} id={id}/>{out&&<><Arrow x={px(0)} y={py(ray.outgoing.from.y)} dx={px(ray.outgoing.to.x)-px(0)} dy={py(ray.outgoing.to.y)-py(ray.outgoing.from.y)} id={id}/>{s.lens==='concave'&&<path d={`M300 ${py(ray.outgoing.from.y)}L${px(-f)} 170`} strokeDasharray="6 4"/>}</>}</g>)}</>:<Reflection s={s} id={id} outgoing={!!out}/>}<ScienceText x={309} y={190} italic>O</ScienceText></g></>;
}
function Reflection({s,id,outgoing}:{s:Spec;id:string;outgoing:boolean}){
 const tangent=(s.mirrorAngle??90)*Math.PI/180,normal=tangent-Math.PI/2,a=(s.incidenceAngle??0)*Math.PI/180,dx=Math.cos(normal+a),dy=Math.sin(normal+a),reflected=traceReflection({x:dx,y:dy},s.mirrorAngle??90),tx=Math.cos(tangent),ty=Math.sin(tangent);
 return <><path d={`M${300-tx*120} ${170+ty*120}L${300+tx*120} ${170-ty*120}`}/>{Array.from({length:12},(_,i)=>{const at=(i-5.5)*20,x=300+tx*at,y=170-ty*at;return <path key={i} d={`M${x} ${y}l${10*Math.cos(normal)+tx*5} ${-10*Math.sin(normal)-ty*5}`} strokeWidth={.8}/>;})}<path d={`M${300-140*Math.cos(normal)} ${170+140*Math.sin(normal)}L${300+140*Math.cos(normal)} ${170-140*Math.sin(normal)}`} strokeDasharray="5 4"/><Arrow x={300-dx*175} y={170+dy*175} dx={dx*175} dy={-dy*175} id={id}/>{outgoing&&<Arrow x={300} y={170} dx={reflected.x*175} dy={-reflected.y*175} id={id}/>}<ScienceText x={90} y={305}>i = {Math.abs(s.incidenceAngle??0)}°</ScienceText></>;
}
