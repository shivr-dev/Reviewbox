import type {SemanticDiagram} from './diagram-spec';
import {boundaryExpression,linearRegion,visibleRegions,type RegionShape,type DiagramStage} from './shaded-regions';
import {certifiedCurve,cubicCurve} from './verified-curve';

export type MathSpec=Extract<SemanticDiagram,{kind:'geometry'|'function'}>;
export type XY=[number,number];
export const PRINT_FONT='"STIX Two Text", "Cambria Math", "Times New Roman", "Noto Serif SC", serif';
export const svgEscape=(s:unknown)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
export function mathBounds(spec:MathSpec):[number,number,number,number]{
 if(spec.kind==='function')return [spec.xRange[0],spec.yRange[0],spec.xRange[1],spec.yRange[1]];
 if(spec.bounds)return spec.bounds;
 const points:XY[]=spec.points.map(p=>[p.x,p.y]);
 for(const c of spec.circles??[]){const p=spec.points.find(p=>p.id===c.center)!;points.push([p.x-c.r,p.y-c.r],[p.x+c.r,p.y+c.r]);}
 const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys);
 const span=Math.max(xmax-xmin,ymax-ymin,1),pad=span*.04;
 return [xmin-pad,ymin-pad,xmax+pad,ymax+pad];
}
export function printProjection(bounds:[number,number,number,number],width=600,height=380,padding=39){
 const [xmin,ymin,xmax,ymax]=bounds,scale=Math.min((width-2*padding)/(xmax-xmin),(height-2*padding)/(ymax-ymin));
 const project=([x,y]:XY):XY=>[width/2+(x-(xmin+xmax)/2)*scale,height/2-(y-(ymin+ymax)/2)*scale];
 return {project,scale,width,height};
}
const pathLine=(points:XY[],project:(p:XY)=>XY)=>points.map((p,i)=>(i?'L':'M')+project(p).join(',')).join(' ');

/** All markup comes from validated numeric structure; no imported SVG/HTML is inserted. */
export function regionArtwork(spec:MathSpec,stage:DiagramStage,prefix:string,project:(p:XY)=>XY,scale:number,width:number,height:number){
 let serial=0;const definitions:string[]=[],bounds=mathBounds(spec),full=`<rect width="${width}" height="${height}"/>`;
 const points=new Map(spec.kind==='geometry'?spec.points.map(p=>[p.id,[p.x,p.y] as XY]):[]);
 const circles=new Map(spec.kind==='geometry'?(spec.circles??[]).map(c=>[c.id,{p:points.get(c.center)!,r:c.r}]):[]);
 const path=(d:string,extra='')=>`<path d="${d}" ${extra}/>`;
 function curve(b:number|{function:number},range:[number,number],reverse=false){
  const expression=boundaryExpression(b,spec),cubic=cubicCurve(expression,range);
  if(cubic){const cp=(reverse?[...cubic].reverse():cubic).map(project);return `M${cp[0]} C${cp[1]} ${cp[2]} ${cp[3]}`;}
  const samples=certifiedCurve(expression,range,.12/scale);return pathLine(reverse?samples.reverse():samples,project);
 }
 function circlePath(circleId:string,start=0,end=360,inner=0,segment=false){
  const c=circles.get(circleId);if(!c)throw new Error('圆边界引用无效');
  const span=((end-start)%360+360)%360||360,at=(r:number,a:number):XY=>project([c.p[0]+r*Math.cos(a*Math.PI/180),c.p[1]+r*Math.sin(a*Math.PI/180)]);
  const arc=(r:number,a:number,b:number,reverse=false)=>{
   const delta=b-a,parts=Math.ceil(Math.abs(delta)/180);let d='';
   for(let i=1;i<=parts;i++)d+=` A${r*scale},${r*scale} 0 0 ${reverse?1:0} ${at(r,a+delta*i/parts)}`;return d;
  };
  if(span===360){let d=`M${at(c.r,start)}`+arc(c.r,start,start+360)+' Z';if(inner)d+=` M${at(inner,start)}`+arc(inner,start,start-360,true)+' Z';return d;}
  const outer=`M${at(c.r,start)}`+arc(c.r,start,start+span);
  if(segment)return outer+' Z';
  if(inner)return outer+` L${at(inner,start+span)}`+arc(inner,start+span,start,true)+' Z';
  return outer+` L${project(c.p)} Z`;
 }
 function leaf(shape:RegionShape):string{
  switch(shape.kind){
   case 'polygon':return path(pathLine(shape.vertices.map(id=>points.get(id)!),project)+' Z');
   case 'circle':return path(circlePath(shape.circleId));
   case 'sector':case 'segment':return path(circlePath(shape.circleId,shape.startAngle,shape.endAngle,0,shape.kind==='segment'));
   case 'annular-sector':return path(circlePath(shape.circleId,shape.startAngle,shape.endAngle,shape.innerRadius));
   case 'annulus':return path(circlePath(shape.outerCircle,0,360,circles.get(shape.innerCircle)!.r),'fill-rule="evenodd"');
   case 'between':{
    const upper=curve(shape.upper,shape.xRange),lower=curve(shape.lower,shape.xRange,true);
    return path(upper+lower.replace(/^M/,' L')+' Z','fill-rule="evenodd"');
   }
   case 'linear-system':{const p=linearRegion(shape.constraints,bounds);return p.length?path(pathLine(p as XY[],project)+' Z'):'';}
   default:throw new Error('复合区域必须由遮罩构造');
  }
 }
 function mask(shape:RegionShape,invert=false){
  const id=`${prefix}-m${serial++}`;
  definitions.push(`<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}" style="mask-type:luminance">${invert?'<g fill="white">'+full+'</g>':''}<g fill="${invert?'black':'white'}" stroke="none">${fill(shape)}</g></mask>`);
  return id;
 }
 function fill(shape:RegionShape):string{
  if(!('children'in shape))return leaf(shape);
  if(shape.kind==='union')return shape.children.map(fill).join('');
  let content=fill(shape.children[0]);
  for(const child of shape.children.slice(1))content=`<g mask="url(#${mask(child,shape.kind==='difference')})">${content}</g>`;
  return content;
 }
 function edge(shape:RegionShape):string{
  if('children'in shape){
   return shape.children.map((child,i)=>{
    let content=edge(child);
    for(let j=0;j<shape.children.length;j++)if(j!==i){
     // A-B: A's boundary outside B; B's boundary inside A.
     const invert=shape.kind==='union'||(shape.kind==='difference'&&i===0);
     content=`<g mask="url(#${mask(shape.children[j],invert)})">${content}</g>`;
    }return content;
   }).join('');
  }
  if(shape.kind==='between'){
   const u=curve(shape.upper,shape.xRange),l=curve(shape.lower,shape.xRange),dash=(included?:boolean)=>included===false?'stroke-dasharray="6 4"':'';
   const endpoints=(x:number,included?:boolean)=>{const f=certifiedCurve(boundaryExpression(shape.lower,spec),shape.xRange,.12/scale),g=certifiedCurve(boundaryExpression(shape.upper,spec),shape.xRange,.12/scale),index=x===shape.xRange[0]?0:-1;return path(pathLine([f.at(index)!,g.at(index)!],project),dash(included));};
   return path(u,dash(shape.includeUpper))+path(l,dash(shape.includeLower))+endpoints(shape.xRange[0],shape.includeStart)+endpoints(shape.xRange[1],shape.includeEnd);
  }
  if(shape.kind==='linear-system'){
   const poly=linearRegion(shape.constraints,bounds);if(!poly.length)return '';
   return poly.map((a,i)=>{const b=poly[(i+1)%poly.length],c=shape.constraints.find(c=>{
    const norm=Math.hypot(c.a,c.b);return Math.abs((c.a*(a[0]+b[0])/2+c.b*(a[1]+b[1])/2-c.c)/norm)<1e-8;
   });if(!c)return '';return path(pathLine([a as XY,b as XY],project),['lt','gt'].includes(c.relation)?'stroke-dasharray="6 4"':'');}).join('');
  }
  return leaf(shape);
 }
 const fills:string[]=[],edges:string[]=[],labels:{x:number;y:number;text:string}[]=[];
 for(const region of visibleRegions(spec.regions,stage,spec.regionTask==='construct')){
  const id=`${prefix}-pattern-${serial++}`,s=region.style,spacing=s.spacing;
  if(s.type!=='solid')definitions.push(`<pattern id="${id}" patternUnits="userSpaceOnUse" width="${spacing}" height="${spacing}" patternTransform="rotate(${-s.angle})">${s.type==='dots'?`<circle cx="${spacing/2}" cy="${spacing/2}" r=".8" fill="#555"/>`:`<path d="M0 0 L0 ${spacing}${s.type==='crosshatch'?` M0 0 L${spacing} 0`:''}" stroke="#555" stroke-width=".75"/>`}</pattern>`);
  fills.push(`<g mask="url(#${mask(region.shape)})" fill="${s.type==='solid'?'#c7c7c7':`url(#${id})`}" opacity="${s.opacity}">${full}</g>`);
  if(region.boundary!=='none')edges.push(`<g fill="none" stroke="#222" stroke-width="1.2" ${region.boundary==='excluded'?'stroke-dasharray="6 4"':''}>${edge(region.shape)}</g>`);
  if(region.label){const [x,y]=project([region.label.x,region.label.y]);labels.push({x,y,text:region.label.text});}
 }
 return {defs:definitions.join(''),fills:fills.join(''),edges:edges.join(''),labels};
}

/** Score candidate label positions against paths as well as already reserved text. */
export function publicationLabels(items:{x:number;y:number;text:string;italic?:boolean}[],obstacles:XY[][],width:number,height:number){
 const placed:{x:number;y:number;w:number;h:number}[]=[];
 return items.map(item=>{
  const w=Math.max(10,[...item.text].reduce((n,c)=>n+(/[\u3400-\u9fff]/.test(c)?15:8),0));
  let best={x:item.x+9,y:item.y-10,score:Infinity};
  for(const [dx,dy]of [[10,-10],[-w-10,-10],[10,23],[-w-10,23],[-w/2,-18],[-w/2,30],[20,-28],[-w-20,-28]]){
   const x=Math.max(6,Math.min(width-w-6,item.x+dx)),y=Math.max(20,Math.min(height-8,item.y+dy));
   let score=Math.hypot(dx,dy)*.01;
   for(const box of placed)if(x<box.x+box.w+4&&x+w+4>box.x&&y-16<box.y+5&&y+5>box.y-16)score+=1000;
   for(const line of obstacles)for(let i=0;i<line.length-1;i++){
    const a=line[i],b=line[i+1],steps=Math.min(60,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/5));
    for(let k=0;k<=steps;k++){const px=a[0]+(b[0]-a[0])*k/steps,py=a[1]+(b[1]-a[1])*k/steps;if(px>x-2&&px<x+w+2&&py>y-16&&py<y+3)score+=4;}
   }
   if(score<best.score)best={x,y,score};
  }
  placed.push({...best,w,h:18});
  return `<text x="${best.x}" y="${best.y}" fill="#161616" stroke="white" stroke-width="3" paint-order="stroke" font-family="${svgEscape(PRINT_FONT)}" font-size="16" ${item.italic!==false&&/^[A-Za-z][A-Za-z0-9′']*$/.test(item.text)?'font-style="italic"':''}>${svgEscape(item.text)}</text>`;
 }).join('');
}

export function serializePublicationSvg(svg:SVGSVGElement){
 const clone=svg.cloneNode(true) as SVGSVGElement;
 clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
 clone.setAttribute('style',`background:white;color:#161616;font-family:${PRINT_FONT}`);
 clone.querySelectorAll('foreignObject,script').forEach(el=>el.remove());
 clone.querySelectorAll('*').forEach(el=>{for(const attr of Array.from(el.attributes))if(attr.name.startsWith('on'))el.removeAttribute(attr.name);});
 return '<?xml version="1.0" encoding="UTF-8"?>\n'+new XMLSerializer().serializeToString(clone);
}
export function downloadDiagram(svg:SVGSVGElement,name:string){const blob=new Blob([serializePublicationSvg(svg)],{type:'image/svg+xml'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name+'.svg';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
