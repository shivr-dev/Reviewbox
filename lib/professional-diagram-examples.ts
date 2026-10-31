import {semanticDiagramSchema} from './diagram-spec';

/** Authoring examples also serve as reproducible, schema-checked acceptance cases. */
const p=(id:string,x:number,y:number)=>({id,x,y});
const geometry=(points:ReturnType<typeof p>[],segments:string[][],extra={})=>({type:'semantic',kind:'geometry',points,segments,...extra});
const fn=(functions:string[],xRange:number[],yRange:number[],extra={})=>({type:'semantic',kind:'function',functions:functions.map(expression=>({expression})),xRange,yRange,...extra});
const region=(id:string,shape:unknown,type='hatch',extra={})=>({id,shape,style:{type,angle:45,spacing:8,opacity:.75},...extra});
export const PUBLICATION_CASES=[
 {id:'triangle',title:'三角形与垂线',prompt:'如图，AD ⟂ BC，BD = 3，DC = 3，AD = 4。求三角形 ABC 的面积。',answer:'12',diagram:geometry([p('A',3,4),p('B',0,0),p('C',6,0),p('D',3,0)],[['A','B'],['B','C'],['C','A']],{auxiliary:[['A','D']],marks:[{kind:'right',points:['A','D','C']},{kind:'dimension',points:['B','C'],label:'6'},{kind:'dimension',points:['D','A'],label:'4'}]})},
 {id:'tangent',title:'圆、切线与角度',prompt:'圆 O 的半径为 3，PA 为切线，A 为切点。已知 ∠AOP = 60°，求 OP。',answer:'6',diagram:geometry([p('O',0,0),p('A',3,0),p('P',3,3*Math.sqrt(3))],[['O','A'],['A','P'],['P','O']],{circles:[{id:'c',center:'O',r:3}],marks:[{kind:'tangent',points:['A','P'],circleId:'c'},{kind:'right',points:['O','A','P']},{kind:'angle',points:['A','O','P'],label:'60°'}]})},
 {id:'quadratic',title:'二次函数',prompt:'函数 y = x² − 2x − 3 的图像如图。写出它与 x 轴的交点坐标。',answer:'(-1,0), (3,0)',diagram:fn(['x^2-2*x-3'],[-3,5],[-5,6],{keyPoints:[p('A',-1,0),p('B',3,0)]})},
 {id:'reciprocal',title:'反比例函数',prompt:'如图，函数 y = 4/x。点 P 的横坐标为 2，求它的纵坐标。',answer:'2',diagram:fn(['4/x'],[-6,6],[-5,5],{keyPoints:[p('P',2,2)]})},
 {id:'triangle-shade',title:'三角形阴影面积',prompt:'矩形 ABCD 的长为 6，宽为 4。阴影为三角形 ABD，求阴影面积。',answer:'12',diagram:geometry([p('A',0,4),p('B',0,0),p('C',6,0),p('D',6,4)],[['A','B'],['B','C'],['C','D'],['D','A'],['B','D']],{regions:[region('triangle',{kind:'polygon',vertices:['A','B','D']})]})},
 {id:'sector',title:'圆与扇形阴影',prompt:'圆 O 的半径为 3，阴影为圆内除去 90° 扇形的区域，求阴影面积。',answer:'27π/4',diagram:geometry([p('O',0,0),p('A',3,0),p('B',0,3)],[['O','A'],['O','B']],{circles:[{id:'c',center:'O',r:3}],regions:[region('sector',{kind:'difference',children:[{kind:'circle',circleId:'c'},{kind:'sector',circleId:'c',startAngle:0,endAngle:90}]},'solid')],marks:[{kind:'right',points:['A','O','B']}]})},
 {id:'circle-intersection',title:'两圆交集',prompt:'两个半径为 2 的圆，其圆心距离为 2。图中阴影表示两圆交集，求其面积。',answer:'8π/3-2√3',diagram:geometry([p('O₁',-1,0),p('O₂',1,0)],[],{circles:[{id:'c1',center:'O₁',r:2},{id:'c2',center:'O₂',r:2}],regions:[region('intersection',{kind:'intersection',children:[{kind:'circle',circleId:'c1'},{kind:'circle',circleId:'c2'}]},'crosshatch')]})},
 {id:'between',title:'两曲线围成的区域',prompt:'阴影区域由 y = 4 − x² 与 y = x² − 4 围成。求其面积。',answer:'64/3',diagram:fn(['4-x^2','x^2-4'],[-3,3],[-5,5],{regions:[region('between',{kind:'between',upper:{function:0},lower:{function:1},xRange:[-2,2]})]})},
 {id:'integral',title:'定积分区域',prompt:'图中阴影表示 ∫₀² x² dx。求该定积分。',answer:'8/3',diagram:fn(['x^2'],[-1,3],[-1,5],{regions:[region('integral',{kind:'between',upper:{function:0},lower:0,xRange:[0,2]},'solid')]})},
 {id:'inequalities',title:'二元一次不等式组',prompt:'阴影表示 x ≥ 0，y > 0，x + y ≤ 4 的公共解集。判断 (1, 2) 是否在解集中。',answer:'是',diagram:fn(['4-x'],[-1,5],[-1,5],{regions:[region('system',{kind:'linear-system',constraints:[{a:1,b:0,c:0,relation:'ge'},{a:0,b:1,c:0,relation:'gt'},{a:1,b:1,c:4,relation:'le'}]},'crosshatch')]})},
 {id:'convex',title:'凸透镜成像',prompt:'凸透镜焦距为 10，物距为 30，物高为 3。图示为成像光路，判断像的性质。',answer:'倒立、缩小的实像',diagram:{type:'semantic',kind:'optics',lens:'convex',focalLength:10,objectDistance:30,objectHeight:3,showRays:true,showImage:true}},
 {id:'concave',title:'凹透镜成像',prompt:'凹透镜焦距大小为 10，物距为 30，物高为 3。判断图中像的性质。',answer:'正立、缩小的虚像',diagram:{type:'semantic',kind:'optics',lens:'concave',focalLength:10,objectDistance:30,objectHeight:3,showRays:true,showImage:true}},
 {id:'reflection',title:'平面镜反射',prompt:'物体位于平面镜前 3 个单位。依据反射光线判断物体与像之间的距离。',answer:'6',diagram:{type:'semantic',kind:'optics',opticalElement:'mirror',objectDistance:3,objectHeight:1,mirrorAngle:90,showRays:true,showImage:true}},
 {id:'refraction',title:'折射',prompt:'光从折射率为 1 的介质入射折射率为 1.5 的介质，入射角为 30°。求折射角（精确到 0.01°）。',answer:'19.47°',diagram:{type:'semantic',kind:'optics',opticalElement:'interface',refractiveIndex1:1,refractiveIndex2:1.5,incidenceAngle:30,showRays:true,showImage:false}},
].map(c=>({...c,diagram:semanticDiagramSchema.parse(c.diagram)}));

export const SHADING_IMPORT_SKILL=`
## 专业制图 3.0：JSXGraph 与光学计算
- 仍只输出 Semantic Diagram JSON。geometry/function 由 JSXGraph 只读呈现；optics 使用 Ray Optics 独立计算与 Reviewbox SVG。严禁输出 JSXGraph/JessieCode/JavaScript/HTML/SVG path。
- geometry 可增加 auxiliary:[[点ID,点ID]] 和 bounds:[xmin,ymin,xmax,ymax]。变量标签使用普通 Unicode 文本（如 A、x、O、F、30°），不要将原始 LaTeX 命令塞进 label；题干中的公式继续使用既有 LaTeX。
- geometry/function 可增加 regions 和 regionTask:"read"|"construct"。每个区域为 {id,shape,phase:"question"|"hint"|"solution",style:{type:"hatch"|"solid"|"crosshatch"|"dots",angle:45,spacing:8,opacity:0.7},boundary:"included"|"excluded"|"none",label?:{text,x,y}}。不使用时省略。构造/判断阴影的答案区域须 regionTask:"construct" 且 phase:"hint" 或 "solution"，作答前不可泄露。
- shape 可为 {kind:"polygon",vertices:[点ID...]}, {kind:"circle",circleId}, {kind:"sector"|"segment",circleId,startAngle,endAngle}, {kind:"annulus",outerCircle,innerCircle}, {kind:"annular-sector",circleId,innerRadius,startAngle,endAngle}。角度从 +x 轴逆时针计，结束角沿逆时针到达，整圆相差 360°；圆环必须同心且外半径更大。
- 布尔组合：{kind:"intersection"|"union",children:[shape,shape,...]} 或 {kind:"difference",children:[被减区域,减去区域]}。差集只能两个子区域，嵌套最多五层，总区域节点不超过48；不要用估计的多边形代替圆弧或交集。
- 函数区域：{kind:"between",lower:0或{function:函数下标},upper:0或{function:函数下标},xRange:[a,b],includeLower:true,includeUpper:true,includeStart:true,includeEnd:true}。函数下标引用当前 diagram.functions（从0开始），变式必须同时更新函数、范围、交点和答案；不可复用旧曲线采样点。分段区间用多个 regions 或 union。
- 函数阴影支持显式代数运算与 -8 至8 的整数次幂；无变量指数、不支持任意外部函数。范围不能跨越渐近线或未定义点，无法可靠确定时保留原图，不瞎画。
- 二元一次不等式组：{kind:"linear-system",constraints:[{a,b,c,relation:"lt"|"le"|"gt"|"ge"}]} 表示 a*x+b*y 与 c 的关系。a,b 不能同时0；严格边界用 lt/gt（虚线），非严格用 le/ge（实线）；仅显示坐标窗口内的解集，不擅自加入额外数学约束。
- optics 默认 opticalElement:"lens"，lens:"convex"|"concave"，focalLength、objectDistance、objectHeight 为题目给出的同单位正数。平面镜用 opticalElement:"mirror",objectDistance,objectHeight,mirrorAngle（镜面切线与 +x 轴夹角，默认90°）。折射用 opticalElement:"interface",refractiveIndex1,refractiveIndex2,incidenceAngle（相对 +x 法线的有符号角，绝对值小于90°）。不编造折射率或光学条件。
- showRays/showImage 默认 false；如在解析才显示，设 showRays:true,raysPhase:"solution",showImage:true,imagePhase:"solution"。光路本身是已知题图时可 phase:"question"。showDistances:true 只显示已知物距；像距仅随已允许的像一起显示。
- 输出前验证区域边界、函数交点、几何关系与题干一致。题图、提示、解析三阶段分别检查。仅支持平面镜与理想薄透镜，不宣称可描述球面镜或真实厚透镜像差。

完整合法图形示例（替换完整学习包中某一道题的 diagram 字段；题干须匹配给定条件）：
${JSON.stringify(PUBLICATION_CASES.map(c=>({title:c.title,diagram:c.diagram})),null,2)}
`;
