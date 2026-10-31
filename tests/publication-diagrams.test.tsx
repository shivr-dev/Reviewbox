import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {semanticDiagramSchema} from '../lib/diagram-spec';
import {PUBLICATION_CASES,SHADING_IMPORT_SKILL} from '../lib/professional-diagram-examples';
import {regionShapeSchema,linearRegion,polygonArea,visibleRegions} from '../lib/shaded-regions';
import {certifiedCurve,cubicCurve,rationalExpression,rationalValue} from '../lib/verified-curve';
import {mathBounds,printProjection,regionArtwork} from '../lib/math-svg';
import {OpticsDrawing,opticsVisibility} from '../components/optics-diagram';
import {traceOptics,traceRefraction} from '../lib/ray-optics-adapter';
import {IMPORT_SKILL} from '../lib/import-skill';

test('all fourteen publication fixtures validate through the real semantic schema',()=>{
 assert.equal(PUBLICATION_CASES.length,14);for(const c of PUBLICATION_CASES)assert.equal(semanticDiagramSchema.safeParse(c.diagram).success,true,c.id);
 assert.ok(IMPORT_SKILL.includes(SHADING_IMPORT_SKILL));assert.ok(IMPORT_SKILL.includes('regionTask'));
});
test('undefined domains survive algebraic simplification and dangerous inputs are rejected',()=>{
 for(const expression of ['1/x','1/(1/x)','1/(x*x-2)'])assert.throws(()=>certifiedCurve(expression,[-2,2]));
 for(const expression of ['alert(1)','x^x','Math.sin(x)','(10000000000000000+1)-10000000000000000'])assert.throws(()=>certifiedCurve(expression,[1,2]));
 assert.throws(()=>regionShapeSchema.parse({kind:'union',children:[{kind:'circle',circleId:'c'},{kind:'difference',children:[{kind:'circle',circleId:'c'},{kind:'circle',circleId:'c'},{kind:'circle',circleId:'c'}]}]}));
});
test('interval-certified rational interpolation respects its declared error',()=>{
 const r=rationalExpression('4/x'),curve=certifiedCurve('4/x',[.4,6],.0001);
 for(let i=0;i<curve.length-1;i++){const [a,fa]=curve[i],[b,fb]=curve[i+1];for(const t of [.13,.5,.87]){const x=a+(b-a)*t;assert.ok(Math.abs(rationalValue(r,x)-(fa+(fb-fa)*t))<=.0001);}}
 const cubic=cubicCurve('x^3-2*x+1',[-2,3])!;
 for(let i=0;i<=100;i++){const t=i/100,u=1-t,y=u**3*cubic[0][1]+3*u*u*t*cubic[1][1]+3*u*t*t*cubic[2][1]+t**3*cubic[3][1],x=-2+5*t;assert.ok(Math.abs(y-(x**3-2*x+1))<1e-11);}
});
test('half-plane solution is scale invariant, exact at vertices, and rejects zero-area intersections',()=>{
 const constraints=[{a:1e-9,b:0,c:0,relation:'le' as const}];
 assert.ok(Math.abs(polygonArea(linearRegion(constraints,[-.01,-.01,.01,.01]))-.0002)<1e-12);
 assert.equal(linearRegion([{a:1,b:0,c:0,relation:'lt'},{a:1,b:0,c:0,relation:'ge'}],[-1,-1,1,1]).length,0);
 const poly=linearRegion([{a:1,b:0,c:0,relation:'ge'},{a:0,b:1,c:0,relation:'gt'},{a:1,b:1,c:4,relation:'le'}],[-1,-1,5,5]);assert.equal(polygonArea(poly),8);
});
test('self-touching polygons, foreign code and recursive resource bombs fail schema',()=>{
 const diagram={type:'semantic',kind:'geometry',points:[{id:'a',x:0,y:0},{id:'b',x:2,y:0},{id:'c',x:2,y:2},{id:'d',x:1,y:0},{id:'e',x:0,y:2}],segments:[],regions:[{id:'r',shape:{kind:'polygon',vertices:['a','b','c','d','e']}}]};
 assert.equal(semanticDiagramSchema.safeParse(diagram).success,false);
 assert.equal(regionShapeSchema.safeParse({kind:'circle',circleId:'c',path:'M0 0',script:'alert(1)'}).success,false);
 let shape:unknown={kind:'circle',circleId:'c'};for(let i=0;i<9;i++)shape={kind:'union',children:[shape,{kind:'circle',circleId:'c'}]};assert.equal(regionShapeSchema.safeParse(shape).success,false);
});
test('question/hint/solution layers do not reveal constructed answers',()=>{
 const base=PUBLICATION_CASES.find(c=>c.id==='triangle-shade')!.diagram;
 assert.equal(base.kind,'geometry');if(base.kind!=='geometry')return;
 const solution=semanticDiagramSchema.parse({...base,regionTask:'construct',regions:base.regions!.map(r=>({...r,phase:'solution'}))});
 if(solution.kind!=='geometry')return;
 assert.equal(visibleRegions(solution.regions,'question',true).length,0);assert.equal(visibleRegions(solution.regions,'hint',true).length,0);assert.equal(visibleRegions(solution.regions,'solution',true).length,1);
 const projection=printProjection(mathBounds(solution));assert.equal(regionArtwork(solution,'question','safe',projection.project,projection.scale,600,380).fills,'');
 assert.equal(semanticDiagramSchema.safeParse({...base,regionTask:'construct'}).success,false);
});
test('circles use genuine SVG arcs, combinations use independent masks, and export patterns have scoped IDs',()=>{
 const c=PUBLICATION_CASES.find(c=>c.id==='circle-intersection')!.diagram;if(c.kind!=='geometry')return;
 const pr=printProjection(mathBounds(c)),a=regionArtwork(c,'question','first',pr.project,pr.scale,600,380),b=regionArtwork(c,'question','second',pr.project,pr.scale,600,380);
 assert.ok(a.defs.includes('<pattern'));assert.ok(a.defs.includes(' A'));assert.ok(a.defs.includes('maskUnits="userSpaceOnUse"'));assert.ok(!a.defs.includes('second-'));assert.ok(!b.defs.includes('first-'));
 const integral=PUBLICATION_CASES.find(c=>c.id==='integral')!.diagram;if(integral.kind!=='function')return;const p=printProjection(mathBounds(integral)),art=regionArtwork(integral,'question','integral',p.project,p.scale,600,380);assert.ok(art.defs.includes(' C'));
});
test('union, annuli, annular sectors, segments and holes retain analytic boundaries',()=>{
 const base={type:'semantic',kind:'geometry',points:[{id:'O',x:0,y:0},{id:'A',x:3,y:0}],segments:[],circles:[{id:'c',center:'O',r:3},{id:'inner',center:'O',r:1}]};
 for(const shape of [{kind:'annulus',outerCircle:'c',innerCircle:'inner'},{kind:'annular-sector',circleId:'c',innerRadius:1,startAngle:20,endAngle:160},{kind:'segment',circleId:'c',startAngle:10,endAngle:130},{kind:'union',children:[{kind:'sector',circleId:'c',startAngle:0,endAngle:90},{kind:'circle',circleId:'inner'}]}]){
  const d=semanticDiagramSchema.parse({...base,regions:[{id:'r',shape}]});if(d.kind!=='geometry')return;const p=printProjection(mathBounds(d));assert.ok(regionArtwork(d,'question','r',p.project,p.scale,600,380).defs.includes(' A'));
 }
});
test('variant changed boundaries are recomputed from function references',()=>{
 const original=PUBLICATION_CASES.find(c=>c.id==='integral')!.diagram;if(original.kind!=='function')return;const p=printProjection(mathBounds(original));
 const a=regionArtwork(original,'question','same',p.project,p.scale,600,380),changed=semanticDiagramSchema.parse({...original,functions:[{expression:'2*x^2'}]});if(changed.kind!=='function')return;
 const b=regionArtwork(changed,'question','same',p.project,p.scale,600,380);assert.notEqual(a.defs,b.defs);
});
test('optics uses upstream computed real/virtual images and suppresses solution-only images',()=>{
 const c=PUBLICATION_CASES.find(c=>c.id==='convex')!.diagram;if(c.kind!=='optics')return;
 const hidden={...c,imagePhase:'solution' as const,raysPhase:'solution' as const};assert.deepEqual(opticsVisibility(hidden,'question'),{image:false,rays:false});assert.deepEqual(opticsVisibility(hidden,'solution'),{image:true,rays:true});
 const question=renderToStaticMarkup(<OpticsDrawing spec={hidden} stage="question" id="q"/>),solution=renderToStaticMarkup(<OpticsDrawing spec={hidden} stage="solution" id="s"/>);assert.ok(!question.includes('A′'));assert.ok(solution.includes('A′'));
 const trace=traceOptics({lens:'convex',focalLength:10,objectDistance:30,objectHeight:3});assert.ok(Math.abs(trace.image!.distance-15)<1e-9);assert.ok(Math.abs(trace.image!.height+1.5)<1e-9);
 assert.ok(Math.abs(traceRefraction(30,1,1.5).refractionAngle!-19.47122063449069)<1e-9);
 for(const c of PUBLICATION_CASES.filter(c=>c.diagram.kind==='optics')){if(c.diagram.kind!=='optics')continue;const svg=renderToStaticMarkup(<OpticsDrawing spec={c.diagram} id={c.id}/>);assert.ok(!svg.includes('NaN'));assert.ok(!svg.includes('Infinity'));assert.ok(!svg.includes('<foreignObject'));}
});
