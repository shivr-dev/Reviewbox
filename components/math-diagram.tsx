'use client';
import {useScientificTargets} from './navi-diagram-control';
import DiagramExport from './diagram-export';
import {tr} from '@/lib/i18n';
import {useEffect,useId,useRef,useState} from 'react';
import type {Board} from 'jsxgraph';
import {semanticDiagramSchema} from '@/lib/diagram-spec';
import {evaluateExpression} from '@/lib/diagram-expression';
import {mathBounds,printProjection,publicationLabels,regionArtwork,downloadDiagram,svgEscape,PRINT_FONT,type MathSpec,type XY} from '@/lib/math-svg';
import {flattenShapes,type DiagramStage} from '@/lib/shaded-regions';
import {diagramForStage,visiblePhase} from '@/lib/diagram-registry';

/** Only schema-validated coordinates and safe expression callbacks reach JSXGraph. */
export default function MathDiagram({spec,stage='question'}:{spec:MathSpec;stage?:DiagramStage}){
 const host=useRef<HTMLDivElement>(null),uid=useId().replace(/[^a-z0-9]/gi,''),[status,setStatus]=useState<'loading'|'ready'|'error'>('loading'),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const visible=diagramForStage(spec,stage) as MathSpec;
 const ids=visible.kind==='geometry'?[...visible.points.map(p=>'point:'+p.id),...(visible.circles??[]).map(c=>'circle:'+c.id)]:visible.functions.flatMap((f,i)=>visiblePhase(f.phase,stage)?['function:'+i]:[]);
 const controls=useScientificTargets(ids),objects=useRef(new Map<string,any>());
 useEffect(()=>{for(const [id,o] of objects.current){const active=controls.scientific?.highlights.includes(id);o.setAttribute(id.startsWith('point:')?{fillColor:active?'#1263a8':'#222',size:active?3:1.25,strokeWidth:0}:{strokeColor:active?'#1263a8':'#1c1c1c',strokeWidth:active?3:id.startsWith('function:')?1.65:1.55});}},[controls.scientific,status]);
 const signature=JSON.stringify(spec);
 const figureWidth=spec.kind==='function'?Math.max(360,Math.min(600,Math.round(302*(spec.xRange[1]-spec.xRange[0])/(spec.yRange[1]-spec.yRange[0])+78))):600;
 useEffect(()=>{
  let cancelled=false,board:Board|undefined,dispose:(()=>void)|undefined;
  setStatus('loading');setError('');
  async function mount(){
   const validated=semanticDiagramSchema.parse(JSON.parse(signature));
   if(validated.kind!=='geometry'&&validated.kind!=='function')throw new Error('数学图类型无效');
   const spec=diagramForStage(validated,stage) as MathSpec,bounds=mathBounds(spec),W=figureWidth,H=380,{project,scale}=printProjection(bounds,W,H),regions=regionArtwork(spec,stage,'rb'+uid,project,scale,W,H);
   const {default:JXG}=await import('jsxgraph');
   if(cancelled||!host.current)return;
   const container=host.current;container.replaceChildren();
   // JSXGraph reads computed container dimensions in setBoundingBox. Build in a
   // fixed SVG coordinate plane, then let CSS scale that plane as a whole.
   container.style.width=W+'px';container.style.height=H+'px';
   const [cx,cy]=[(bounds[0]+bounds[2])/2,(bounds[1]+bounds[3])/2];
   const bbox:[number,number,number,number]=[cx-W/(2*scale),cy+H/(2*scale),cx+W/(2*scale),cy-H/(2*scale)];
   board=JXG.JSXGraph.initBoard(container,{renderer:'svg',boundingbox:bbox,keepaspectratio:true,axis:false,grid:false,showNavigation:false,showCopyright:false,showInfobox:false,resize:{enabled:false,throttle:100},pan:{enabled:false},zoom:{wheel:false},registerEvents:false});
   board.resizeContainer(W,H,true,true);board.setBoundingBox(bbox,true);
   dispose=()=>{if(board){JXG.JSXGraph.freeBoard(board);board=undefined;}container.replaceChildren();container.style.removeProperty('width');container.style.removeProperty('height');};
   const common={fixed:true,highlight:false,withLabel:false,strokeColor:'#1c1c1c',strokeWidth:1.55,fillColor:'none',fillOpacity:0};
   const obstacles:XY[][]=[],labels:{x:number;y:number;text:string;italic?:boolean}[]=[];
   const label=(p:XY,text:string,italic=true)=>{const [x,y]=project(p);labels.push({x,y,text,italic});};
   const segment=(a:XY,b:XY,aux=false,arrow=false)=>{
    board!.create('segment',[a,b],{...common,strokeWidth:aux?1:1.45,dash:aux?2:0,lastArrow:arrow?{type:2,size:5}:false});obstacles.push([project(a),project(b)]);
   };
   const extra:string[]=[];
   const svgPath=(points:XY[],dashed=false)=>`<path d="${points.map((p,i)=>(i?'L':'M')+p.join(',')).join(' ')}" fill="none" stroke="#222" stroke-width="1.2" ${dashed?'stroke-dasharray="6 4"':''}/>`;
   objects.current.clear();board.suspendUpdate();
   if(spec.kind==='geometry'){
    const points=new Map(spec.points.map(p=>[p.id,[p.x,p.y] as XY]));
    for(const p of spec.points){objects.current.set('point:'+p.id,board.create('point',[p.x,p.y],{...common,name:'',size:1.25,strokeWidth:0,fillColor:'#222',fillOpacity:1}));label([p.x,p.y],p.label??p.id);}
    for(const [a,b]of spec.segments)segment(points.get(a)!,points.get(b)!);
    for(const [a,b]of spec.auxiliary??[])segment(points.get(a)!,points.get(b)!,true);
    for(const c of spec.circles??[]){const center=points.get(c.center)!;objects.current.set('circle:'+c.id,board.create('circle',[center,c.r],common));obstacles.push(Array.from({length:97},(_,i)=>project([center[0]+c.r*Math.cos(i*Math.PI/48),center[1]+c.r*Math.sin(i*Math.PI/48)])));}
    for(const m of spec.marks??[]){
     const ps=m.points.map(id=>project(points.get(id)!));
     if(m.kind==='right'||m.kind==='angle'){
      const [a,o,b]=ps,ua=[a[0]-o[0],a[1]-o[1]],ub=[b[0]-o[0],b[1]-o[1]],na=Math.hypot(...ua),nb=Math.hypot(...ub),u=ua.map(v=>v/na),v=ub.map(v=>v/nb),r=m.kind==='right'?10:23;
      if(m.kind==='right')extra.push(svgPath([[o[0]+u[0]*r,o[1]+u[1]*r],[o[0]+(u[0]+v[0])*r,o[1]+(u[1]+v[1])*r],[o[0]+v[0]*r,o[1]+v[1]*r]]));
      else {let a0=Math.atan2(u[1],u[0]),delta=Math.atan2(v[1],v[0])-a0;while(delta>Math.PI)delta-=2*Math.PI;while(delta< -Math.PI)delta+=2*Math.PI;const arc=Array.from({length:25},(_,i)=>[o[0]+r*Math.cos(a0+delta*i/24),o[1]+r*Math.sin(a0+delta*i/24)] as XY);extra.push(svgPath(arc));obstacles.push(arc);}
      if(m.label)labels.push({x:o[0]+(u[0]+v[0])*30,y:o[1]+(u[1]+v[1])*30,text:m.label,italic:false});
     }else if(m.kind==='equal'||m.kind==='parallel'){
      for(let j=0;j+1<ps.length;j+=2){const [a,b]=[ps[j],ps[j+1]],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy),u=[dx/len,dy/len],v=[-dy/len,dx/len],mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
       extra.push(m.kind==='equal'?svgPath([[mid[0]-v[0]*5,mid[1]-v[1]*5],[mid[0]+v[0]*5,mid[1]+v[1]*5]]):svgPath([[mid[0]-u[0]*4-v[0]*4,mid[1]-u[1]*4-v[1]*4],[mid[0]+u[0]*3,mid[1]+u[1]*3],[mid[0]-u[0]*4+v[0]*4,mid[1]-u[1]*4+v[1]*4]]));}
     }else if(m.kind==='dimension'){
      const auxiliary=(spec.auxiliary??[]).some(pair=>pair.includes(m.points[0])&&pair.includes(m.points[1]));
      if(auxiliary){if(m.label)labels.push({x:(ps[0][0]+ps[1][0])/2,y:(ps[0][1]+ps[1][1])/2,text:m.label,italic:false});continue;}
      const [a,b]=ps,dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy),n=[-dy/len*24,dx/len*24],p=[a[0]+n[0],a[1]+n[1]] as XY,q=[b[0]+n[0],b[1]+n[1]] as XY;
      extra.push(svgPath([p,q]),svgPath([a,p]),svgPath([b,q]));
      for(const end of [p,q])extra.push(svgPath([[end[0]-3,end[1]-4],[end[0]+3,end[1]+4]]));
      if(m.label)labels.push({x:(p[0]+q[0])/2,y:(p[1]+q[1])/2,text:m.label,italic:false});
     }
    }
   }else{
    const [xmin,ymin,xmax,ymax]=bounds,xaxis=ymin<=0&&ymax>=0,yaxis=xmin<=0&&xmax>=0;
    const constraints=(spec.regions??[]).flatMap(r=>flattenShapes(r.shape)).flatMap(s=>s.kind==='linear-system'?s.constraints:[]);
    const strictX=constraints.some(c=>c.a===0&&c.c===0&&['lt','gt'].includes(c.relation)),strictY=constraints.some(c=>c.b===0&&c.c===0&&['lt','gt'].includes(c.relation));
    if(spec.grid){for(let x=Math.ceil(xmin);x<xmax&&x-Math.ceil(xmin)<80;x++)segment([x,ymin],[x,ymax],true);for(let y=Math.ceil(ymin);y<ymax&&y-Math.ceil(ymin)<80;y++)segment([xmin,y],[xmax,y],true);}
    if(xaxis){segment([xmin,0],[xmax,0],strictX,true);label([xmax,0],spec.xLabel??'x');}
    if(yaxis){segment([0,ymin],[0,ymax],strictY,true);label([0,ymax],spec.yLabel??'y');}
    if(xaxis&&yaxis)label([0,0],'O');
    const nice=(span:number)=>{const raw=span/7,base=10**Math.floor(Math.log10(raw));return [1,2,5,10].map(n=>n*base).find(n=>n>=raw)!;};
    for(const [axis,step]of [['x',spec.tickX??nice(xmax-xmin)],['y',spec.tickY??nice(ymax-ymin)]] as const){
     if(axis==='x'&&!xaxis||axis==='y'&&!yaxis)continue;
     const min=axis==='x'?xmin:ymin,max=axis==='x'?xmax:ymax;
     for(let v=Math.ceil(min/step)*step,k=0;v<max-step*.05&&k<50;v+=step,k++)if(Math.abs(v)>step*.01){
      const p=project(axis==='x'?[v,0]:[0,v]),text=Number(v.toPrecision(5)).toString();
      extra.push(svgPath(axis==='x'?[[p[0],p[1]],[p[0],p[1]-4]]:[[p[0],p[1]],[p[0]+4,p[1]]]));
      // Tick labels have fixed textbook placement; other labels avoid them.
      extra.push(`<text x="${axis==='x'?p[0]:p[0]-9}" y="${axis==='x'?p[1]+20:p[1]+5}" text-anchor="${axis==='x'?'middle':'end'}" fill="#161616" stroke="white" stroke-width="2.5" paint-order="stroke" font-size="15" font-family="${svgEscape(PRINT_FONT)}">${svgEscape(text)}</text>`);
     }
    }
    const shapes=(spec.regions??[]).flatMap(r=>flattenShapes(r.shape));
    for(const [i,f]of spec.functions.entries()){
     if(!visiblePhase(f.phase,stage))continue;
     const exclusive=shapes.some(s=>s.kind==='between'&&((typeof s.lower==='object'&&s.lower.function===i&&s.includeLower===false)||(typeof s.upper==='object'&&s.upper.function===i&&s.includeUpper===false)));
     const domain=f.domain??[xmin,xmax];
     const graph=board.create('functiongraph',[(x:number)=>{const y=evaluateExpression(f.expression,x);return Number.isFinite(y)?y:NaN;},domain[0],domain[1]],{...common,strokeWidth:1.65,dash:exclusive?2:0,numberPointsHigh:1200,numberPointsLow:600,doAdvancedPlot:true});
     objects.current.set('function:'+i,graph);
     // Keep function traces inside the mathematical viewport, leaving margins for labels.
     const node=(graph as unknown as {rendNode:SVGElement}).rendNode;if(node)node.style.clipPath=`url(#rb${uid}-plot)`;
     let line:XY[]=[];for(let k=0;k<=600;k++){const x=xmin+(xmax-xmin)*k/600,y=evaluateExpression(f.expression,x);if(Number.isFinite(y)&&y>=ymin&&y<=ymax)line.push(project([x,y]));else if(line.length){obstacles.push(line);line=[];}}if(line.length)obstacles.push(line);
     // Labels supplied by authors only; expressions are not printed as untypeset code.
     if(f.label){const x=xmin+(xmax-xmin)*(.68+i*.08),y=evaluateExpression(f.expression,x);if(y>ymin&&y<ymax)label([x,y],f.label,false);}
    }
    for(const p of spec.keyPoints??[]){board.create('point',[p.x,p.y],{...common,name:'',size:1.5,fillColor:'#222',fillOpacity:1});label([p.x,p.y],p.label??p.id);}
   }
   board.unsuspendUpdate();
   const svg=container.querySelector('svg')!;svg.setAttribute('viewBox',`0 0 ${W} ${H}`);svg.setAttribute('width','100%');svg.setAttribute('height','100%');svg.setAttribute('role','img');svg.setAttribute('aria-label',spec.caption??(spec.kind==='geometry'?'几何图':'函数图像'));
   function group(markup:string){const g=document.createElementNS('http://www.w3.org/2000/svg','g');g.innerHTML=markup;return g;}
   const background=group(`<rect width="${W}" height="${H}" fill="white"/>`);
   svg.insertBefore(background,svg.firstChild);
   const corner=project([bounds[0],bounds[3]]),opposite=project([bounds[2],bounds[1]]),clipId=`rb${uid}-plot`,clip=`<clipPath id="${clipId}"><rect x="${corner[0]}" y="${corner[1]}" width="${opposite[0]-corner[0]}" height="${opposite[1]-corner[1]}"/></clipPath>`;
   const shades=group(`<defs>${clip}${regions.defs}</defs><g ${spec.kind==='function'?`clip-path="url(#${clipId})"`:''}>${regions.fills}</g>`);svg.insertBefore(shades,background.nextSibling);
   const foreground=group(`<g ${spec.kind==='function'?`clip-path="url(#${clipId})"`:''}>${regions.edges}</g>`+extra.join('')+publicationLabels([...labels,...regions.labels],obstacles,W,H));svg.appendChild(foreground);
   // Fixed viewBox preserves stroke and text proportions on mobile and in exports.
   container.style.removeProperty('width');container.style.removeProperty('height');
   container.dataset.engine='jsxgraph';container.dataset.stage=stage;setStatus('ready');
  }
  mount().catch(e=>{dispose?.();if(!cancelled){setError(e instanceof Error?e.message:'图形加载失败');setStatus('error');}});
  return ()=>{cancelled=true;dispose?.();};
 },[signature,stage,uid,retry,figureWidth]);
 return <figure className="diagram publication-diagram" style={{maxWidth:figureWidth}} data-diagram-kind={spec.kind} aria-busy={status==='loading'}>
  {status==='loading'&&<div className="diagram-loading" role="status" aria-live="polite"><span className="diagram-spinner" aria-hidden="true"/><span>{tr("common:题图加载中…")}</span><small>{tr("common:首次使用需要加载绘图工具")}</small></div>}
  {status==='error'&&<div className="diagram-error" role="alert"><p>{tr("common:图形未显示：")}{error}{tr("common:。请保留原图或检查图形条件。")}</p><button type="button" className="diagram-export" onClick={()=>setRetry(n=>n+1)}>{tr("common:重试加载")}</button></div>}
  <div ref={host} id={'math-'+uid} className="publication-board" style={{aspectRatio:figureWidth+'/380'}} hidden={status==='error'}/>
  <figcaption><span>{spec.caption}</span><DiagramExport getSvg={()=>host.current?.querySelector('svg')} name={'Reviewbox-'+spec.kind+'-'+stage} disabled={status!=='ready'}/></figcaption>
 </figure>;
}
