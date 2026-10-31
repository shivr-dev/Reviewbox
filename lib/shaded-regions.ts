import {z} from 'zod';
import {certifiedCurve} from './verified-curve';
export type DiagramStage='question'|'hint'|'solution';
export type RegionShape=
 |{kind:'polygon';vertices:string[]}
 |{kind:'circle';circleId:string}
 |{kind:'sector'|'segment';circleId:string;startAngle:number;endAngle:number}
 |{kind:'annulus';outerCircle:string;innerCircle:string}
 |{kind:'annular-sector';circleId:string;innerRadius:number;startAngle:number;endAngle:number}
 |{kind:'between';lower:number|{function:number};upper:number|{function:number};xRange:[number,number];includeLower?:boolean;includeUpper?:boolean;includeStart?:boolean;includeEnd?:boolean}
 |{kind:'linear-system';constraints:{a:number;b:number;c:number;relation:'lt'|'le'|'gt'|'ge'}[]}
 |{kind:'union'|'intersection'|'difference';children:RegionShape[]};
const num=z.number().finite().min(-10000).max(10000),id=z.string().min(1).max(60),angle=z.number().min(-360).max(360),bound=z.union([num,z.object({function:z.number().int().min(0).max(4)}).strict()]);
const recursive:z.ZodType<RegionShape>=z.lazy(()=>z.discriminatedUnion('kind',[
 z.object({kind:z.literal('polygon'),vertices:z.array(id).min(3).max(40)}).strict(),
 z.object({kind:z.literal('circle'),circleId:id}).strict(),
 z.object({kind:z.enum(['sector','segment']),circleId:id,startAngle:angle,endAngle:angle}).strict(),
 z.object({kind:z.literal('annulus'),outerCircle:id,innerCircle:id}).strict(),
 z.object({kind:z.literal('annular-sector'),circleId:id,innerRadius:z.number().positive().max(10000),startAngle:angle,endAngle:angle}).strict(),
 z.object({kind:z.literal('between'),lower:bound,upper:bound,xRange:z.tuple([num,num]).refine(([a,b])=>b>a),includeLower:z.boolean().optional(),includeUpper:z.boolean().optional(),includeStart:z.boolean().optional(),includeEnd:z.boolean().optional()}).strict(),
 z.object({kind:z.literal('linear-system'),constraints:z.array(z.object({a:num,b:num,c:num,relation:z.enum(['lt','le','gt','ge'])}).strict()).min(1).max(12)}).strict(),
 z.object({kind:z.enum(['union','intersection','difference']),children:z.array(recursive).min(2).max(8)}).strict(),
]));
function bounded(value:unknown){const stack=[{v:value,depth:0}];let count=0;while(stack.length){const {v,depth}=stack.pop()!;if(++count>48||depth>5)return false;if(v&&typeof v==='object'&&'children'in v){if(!Array.isArray(v.children)||('kind'in v&&v.kind==='difference'&&v.children.length!==2))return false;for(const child of v.children)stack.push({v:child,depth:depth+1});}}return true;}
export const regionShapeSchema=z.preprocess(value=>bounded(value)?value:undefined,recursive);
export const shadedRegionSchema=z.object({
 id,shape:regionShapeSchema,phase:z.enum(['question','hint','solution']).default('question'),
 style:z.object({type:z.enum(['hatch','crosshatch','solid','dots']).default('hatch'),angle:z.number().min(-180).max(180).default(45),spacing:z.number().min(3).max(20).default(8),opacity:z.number().min(.1).max(1).default(.7)}).default({type:'hatch',angle:45,spacing:8,opacity:.7}),
 boundary:z.enum(['included','excluded','none']).default('included'),label:z.object({text:z.string().max(60),x:num,y:num}).optional(),
}).strict();
export type ShadedRegion=z.infer<typeof shadedRegionSchema>;
export type RegionContext={points?:{id:string;x:number;y:number}[];circles?:{id:string;center:string;r:number}[];functions?:{expression:string}[];xRange?:number[];yRange?:number[];regionTask?:'read'|'construct';regions?:ShadedRegion[]};
export function visibleRegions(regions:ShadedRegion[]|undefined,stage:DiagramStage,construct=false){return (regions??[]).filter(r=>!(construct&&stage==='question')&&(r.phase==='question'||r.phase===stage||(stage==='solution'&&r.phase==='hint')));}
export function flattenShapes(shape:RegionShape):RegionShape[]{return 'children'in shape?shape.children.flatMap(flattenShapes):[shape];}
export function boundaryExpression(b:number|{function:number},context:RegionContext){if(typeof b==='number')return String(b);const f=context.functions?.[b.function];if(!f)throw new Error('阴影引用的函数不存在');return f.expression;}
const cross=(a:number[],b:number[],c:number[])=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function touches(a:number[],b:number[],c:number[],d:number[]){
 const on=(p:number[],q:number[],r:number[])=>cross(p,q,r)===0&&r[0]>=Math.min(p[0],q[0])&&r[0]<=Math.max(p[0],q[0])&&r[1]>=Math.min(p[1],q[1])&&r[1]<=Math.max(p[1],q[1]);
 return cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b);
}
export function polygonArea(points:number[][]){return Math.abs(points.reduce((s,p,i)=>s+p[0]*points[(i+1)%points.length][1]-p[1]*points[(i+1)%points.length][0],0))/2;}
export function validateShadedRegions(context:RegionContext){
 const errors:string[]=[],points=new Map(context.points?.map(p=>[p.id,p])??[]),circles=new Map(context.circles?.map(c=>[c.id,c])??[]);
 if(new Set(context.regions?.map(r=>r.id)).size!==(context.regions??[]).length)errors.push('阴影区域 ID 重复');
 for(const region of context.regions??[]){
  if(context.regionTask==='construct'&&region.phase==='question')errors.push('绘制或判断阴影的题目，答案区域必须放在提示或解析阶段');
  if(region.shape.kind==='difference'&&region.shape.children.length!==2)errors.push('差集必须有两个区域');
  for(const s of flattenShapes(region.shape)){
   if(s.kind==='polygon'){
    const ps=s.vertices.map(id=>points.get(id));if(ps.some(p=>!p)){errors.push('阴影多边形引用了不存在的点');continue;}
    const p=ps.map(p=>[p!.x,p!.y]);if(new Set(s.vertices).size!==p.length||polygonArea(p)<1e-9)errors.push('阴影多边形重复或退化');
    for(let i=0;i<p.length;i++)for(let j=i+2;j<p.length;j++){if(i===0&&j===p.length-1)continue;const a=p[i],b=p[(i+1)%p.length],c=p[j],d=p[(j+1)%p.length];if(touches(a,b,c,d))errors.push('阴影多边形自相交，无法确定区域');}
   }else if(s.kind==='annulus'){
    const a=circles.get(s.outerCircle),b=circles.get(s.innerCircle);if(!a||!b||a.center!==b.center||a.r<=b.r)errors.push('圆环必须由同心且半径有序的两个圆确定');
   }else if('circleId'in s){
    const c=circles.get(s.circleId);if(!c)errors.push('阴影引用的圆不存在');
    if('startAngle'in s&&(s.startAngle===s.endAngle||Math.abs(s.endAngle-s.startAngle)>360))errors.push('扇形或弓形的角度范围无效');
    if(s.kind==='annular-sector'&&c&&s.innerRadius>=c.r)errors.push('圆环扇形内半径必须小于外半径');
   }else if(s.kind==='between'){
    try{
     if(context.xRange&&(s.xRange[0]<context.xRange[0]||s.xRange[1]>context.xRange[1]))throw new Error('阴影积分范围超出坐标范围');
     const lower=boundaryExpression(s.lower,context),upper=boundaryExpression(s.upper,context);
     certifiedCurve(lower,s.xRange,.0005);certifiedCurve(upper,s.xRange,.0005);
    }catch(e){errors.push((e as Error).message);}
   }else if(s.kind==='linear-system'&&s.constraints.some(c=>c.a===0&&c.b===0))errors.push('不等式边界的系数不能同时为零');
  }
 }
 return [...new Set(errors)];
}
/** Exact half-plane clipping: vertices are intersections of the stated straight boundaries. */
export function linearRegion(constraints:Extract<RegionShape,{kind:'linear-system'}>['constraints'],bounds:[number,number,number,number]){
 const [xmin,ymin,xmax,ymax]=bounds;let poly=[[xmin,ymin],[xmax,ymin],[xmax,ymax],[xmin,ymax]];
 for(const c of constraints){const norm=Math.hypot(c.a,c.b);if(!norm)throw new Error('不等式边界无效');const sign=c.relation.startsWith('l')?1:-1,evalAt=(p:number[])=>sign*(c.a/norm*p[0]+c.b/norm*p[1]-c.c/norm),next:number[][]=[];
  for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],fa=evalAt(a),fb=evalAt(b),ain=fa<=0,bin=fb<=0;if(ain)next.push(a);if(ain!==bin){const t=fa/(fa-fb);next.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}}
  poly=next;if(!poly.length)break;
 }return poly.length<3||polygonArea(poly)<=Number.EPSILON*(xmax-xmin)*(ymax-ymin)*8?[]:poly;
}
