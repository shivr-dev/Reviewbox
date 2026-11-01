/** Deterministic scientific checks. No natural-language or AI assertion is treated as proof. */
export function scientificErrors(s:any):string[]{
 const errors:string[]=[],fail=(message:string)=>errors.push(message),close=(a:number,b:number,t=.001)=>Math.abs(a-b)<=t*Math.max(1,Math.abs(a),Math.abs(b)),rad=(a:number)=>a*Math.PI/180;
 const unique=(items:any[])=>new Set(items.map(x=>x.id)).size===items.length;
 if(s.kind==='chemistry'){
  if(s.format==='smiles'&&s.data.length>4000)fail('SMILES 最长 4000 字符');
  if(s.view==='molecule3d'&&s.format==='smiles')fail('三维分子需要带坐标的 MOL/SDF，不能从 SMILES 猜测三维坐标');
  const records=s.format==='sdf'?s.data.split(/\$\$\$\$/).filter((r:string)=>r.trim()):[s.data];if(records.length>10||s.moleculeIndex>=records.length)fail('SDF 最多 10 个结构，moleculeIndex 必须引用实际结构');
  if(s.propertiesPhase==='question'&&s.showProperties&&s.unknowns?.some((k:string)=>['formula','mass','smiles'].includes(k)))fail('待求分子属性不能在题目阶段提前显示');
 }
 if(s.kind==='measurement'){
  if(s.reading!==undefined&&s.unknowns?.includes('reading')&&s.readingPhase==='question')fail('待求读数不能在题目阶段直接显示');
  if(s.end<=s.start||(s.end-s.start)/s.minor>500)fail('刻度范围须递增，且最多 500 个小刻度');
  if(!close((s.end-s.start)/s.minor,Math.round((s.end-s.start)/s.minor)))fail('刻度范围必须是分度值的整数倍');
  if(!s.unit)fail('测量图必须声明单位');
  if(s.object&&(s.object.end<=s.object.start||s.object.start<s.start||s.object.end>s.end))fail('被测物端点必须位于标尺范围内且长度为正');
  if(['stack','coil'].includes(s.instrument)&&(!s.object||!s.count))fail('累积测量需要总长度端点和数量');
  if(s.reading!==undefined&&s.object&&!close(s.reading,(s.object.end-s.object.start)/(s.count??1)))fail('测量结果不等于端点差除以数量');
  if(s.instrument==='stopwatch'&&(!['s','min'].includes(s.unit)||s.end-s.start>60||s.start!==0))fail('秒表刻度必须从 0 开始，范围不超过 60，单位为 s 或 min');
 }
 if(s.kind==='biology'){
  if(s.view==='punnett'){if(!s.parents)fail('遗传方格需要两亲本的单基因配子');else{const alleles=s.parents.flatMap((p:any)=>p.gametes);if(new Set(alleles.map((a:string)=>a.toUpperCase())).size!==1)fail('当前遗传方格只支持同一基因位点的单字母等位基因');}}
  if(s.view==='network'&&!s.citation)fail('生物关系网络需要核实后的来源说明');
  if(s.view==='food-web'||s.view==='network'){if(!s.nodes?.length||!s.links?.length)fail('食物网需要物种节点和食物至消费者的有向边');else{if(!unique(s.nodes))fail('食物网节点 ID 重复');for(const l of s.links){const a=s.nodes.find((n:any)=>n.id===l.from),b=s.nodes.find((n:any)=>n.id===l.to);if(l.from===l.to||!a||!b)fail('食物网连接引用无效');else if(Math.hypot((a.x-b.x)*450,(a.y-b.y)*220)<75)fail('食物网中连接的节点过近，请调整布局避免遮挡');}}}
  if(s.view==='cell'){if(s.mode!=='schematic')fail('基础细胞图必须标为 schematic，不能将示意位置当作精确模型');if(!s.cellType||!s.organelles?.length)fail('细胞图需要细胞类型和显式结构清单');if(s.organelles&&!unique(s.organelles))fail('细胞结构 ID 重复');if(s.cellType==='animal'&&s.organelles?.some((o:any)=>['chloroplast','vacuole'].includes(o.kind)))fail('当前动物细胞预设不包含叶绿体或植物式中央液泡');}
 }
 if(s.kind==='wave'){
  if(!unique(s.waves))fail('波形 ID 重复');
  if(s.xRange[1]<=s.xRange[0]||s.yRange[1]<=s.yRange[0])fail('波形坐标范围必须递增');
  if(s.view==='time'&&!['s','ms'].includes(s.xUnit)||s.view==='space'&&!['m','cm'].includes(s.xUnit))fail('时间波形与空间波形的横轴单位不匹配');
  for(const w of s.waves){if(s.view==='time'&&(!w.frequency||w.wavelength!==undefined))fail('时间波形需要 frequency（Hz），不使用 wavelength');if(s.view==='space'&&(!w.wavelength||w.frequency!==undefined))fail('空间波形需要 wavelength（m），不使用 frequency');if(s.yRange[0]>-w.amplitude||s.yRange[1]<w.amplitude)fail('波形纵轴必须包含完整振幅，不能截断后暗示相等');const unit=s.xUnit==='ms'?.001:s.xUnit==='cm'?.01:1;if((s.xRange[1]-s.xRange[0])*unit*(s.view==='time'?w.frequency:1/w.wavelength)>30)fail('波形超过 30 个周期，请缩小时间或空间范围');}
 }
 if(s.kind==='motion'){
  if(s.chart&&s.chart!=='position'&&!s.series?.length)fail('运动坐标图需要真实时间和值组成的 series');
  if(s.series&&(!s.timeUnit||!s.valueUnit))fail('运动坐标图必须声明时间和纵轴单位');
  if(s.chart==='velocity-time'&&s.valueUnit&&!['m/s','km/h','cm/s'].includes(s.valueUnit))fail('速度—时间图纵轴必须是速度单位');
  if(s.chart==='distance-time'&&s.valueUnit&&!['m','cm','km'].includes(s.valueUnit))fail('路程—时间图纵轴必须是长度单位');
  if(s.series&&!unique(s.series))fail('运动序列 ID 重复');
  for(const line of s.series??[]){for(let i=1;i<line.points.length;i++){if(line.points[i].time<=line.points[i-1].time)fail('时间必须严格递增');if(s.chart==='distance-time'&&line.points[i].value<line.points[i-1].value)fail('累计路程不能减少；位移题请使用 position 示意或函数图');}if(s.chart==='distance-time'&&line.points.some((p:any)=>p.value<0))fail('累计路程不能为负');}
  if(!s.series&&s.positions.length<2)fail('位置示意图需要至少两个 positions');
 }
 if(s.kind==='forces'){
  if(!unique(s.forces))fail('力 ID 重复');
  if(s.bodies&&!unique(s.bodies))fail('物体 ID 重复');
  if(s.mode==='quantitative'&&s.forces.some((f:any)=>f.magnitude===undefined))fail('定量受力图的每个力都需要大小');
  if(s.bodies?.some((b:any)=>Math.abs(b.y)>35))fail('多物体示意的纵向排布范围为 −35 至 35（布局坐标，不是物理长度）');
  for(const f of s.forces){if(s.bodies&&!s.bodies.some((b:any)=>b.id===f.bodyId))fail('力引用的物体不存在');if(f.kind==='gravity'&&f.at&&f.at.some((v:number)=>v!==0))fail('重力作用点不能偏离重心');if(['normal','friction','pressure'].includes(f.kind)&&f.origin!=='contact')fail('接触力必须作用于接触点');if(['normal','friction'].includes(f.kind)&&s.surface==='none')fail('未声明接触面却出现支持力或摩擦力');if(f.kind==='gravity'&&f.magnitude!==undefined&&s.mass&&s.g&&!close(f.magnitude,s.mass*s.g))fail('重力大小不满足 G=mg');if(f.kind==='spring'&&f.magnitude!==undefined&&s.spring&&!close(f.magnitude,s.spring.constant*s.spring.extension))fail('弹力大小不满足 F=kΔx（SI 单位）');}
  const allKnown=s.forces.every((f:any)=>f.magnitude!==undefined);
  if((s.equilibrium||s.acceleration)&&!allKnown)fail('验证平衡或牛顿定律需要全部力的大小');
  if(allKnown){for(const bodyId of s.bodies?.map((b:any)=>b.id)??[undefined]){const fs=s.forces.filter((f:any)=>f.bodyId===bodyId),sum=fs.reduce((a:number[],f:any)=>[a[0]+f.magnitude*Math.cos(rad(f.angle)),a[1]+f.magnitude*Math.sin(rad(f.angle))],[0,0]);if(s.equilibrium&&(!close(sum[0],0)||!close(sum[1],0)))fail('声明平衡但合力不为零');if(s.acceleration&&s.mass&&(!close(sum[0],s.mass*s.acceleration[0])||!close(sum[1],s.mass*s.acceleration[1])))fail('合力与 ma 不一致');}
   const friction=s.forces.find((f:any)=>f.kind==='friction'),normal=s.forces.find((f:any)=>f.kind==='normal');if(s.friction&&friction&&normal){const max=s.friction.coefficient*normal.magnitude;if(s.friction.type==='sliding'?!close(friction.magnitude,max):friction.magnitude>max+.001)fail('摩擦力不符合声明的摩擦模型');if(s.friction.motionDirection){const along=Math.cos(rad(friction.angle-(s.incline??0)));if(s.friction.motionDirection==='up'?along>=0:along<=0)fail('滑动摩擦力须与相对运动方向相反');}}
  }
  for(const pair of s.interactions??[]){const a=s.forces.find((f:any)=>f.id===pair.first),b=s.forces.find((f:any)=>f.id===pair.second);if(!a||!b||!a.bodyId||a.bodyId===b.bodyId||!close(Math.cos(rad(a.angle-b.angle)),-1)||a.magnitude!==undefined&&b.magnitude!==undefined&&!close(a.magnitude,b.magnitude))fail('相互作用力必须作用在不同物体上，等大反向');}
 }
 if(s.kind==='lever'){
  const mechanism=s.mechanism??'lever';
  if(mechanism==='lever'&&!s.loads.length)fail('杠杆需要至少一个力');
  if(mechanism!=='lever'){
   const strands=mechanism==='fixed-pulley'?1:mechanism==='movable-pulley'?2:s.supportingStrands;
   if(mechanism==='pulley-block'&&strands!==2&&strands!==4)fail('当前滑轮组支持明确的 2 或 4 段承重绳');
   if(s.load&&s.effort&&strands&&!close(s.effort,s.load/(strands*(s.efficiency??1))))fail('拉力不符合承重绳段数与效率');
   if(mechanism==='inclined-plane'&&(!s.height||!s.length||s.height>s.length))fail('斜面需要满足 0<h≤l 的高度和长度');
   if(mechanism==='inclined-plane'&&s.load&&s.effort&&!close(s.effort,s.load*s.height/(s.length*(s.efficiency??1))))fail('斜面功与效率不一致');
  }else if(s.loads.some((l:any)=>l.position===s.pivot||l.force===0))fail('杠杆力的作用位置不能是支点，力须非零');
 }
 if(s.kind==='buoyancy'&&s.density&&s.volume&&s.mass){const buoyant=s.density*s.volume*s.submerged,weight=s.mass;if(s.state==='floating'&&(s.submerged>=1||!close(buoyant,weight)))fail('漂浮须部分浸没且浮力等于重力');if(s.state==='suspended'&&(s.submerged!==1||!close(buoyant,weight)))fail('悬浮须全部浸没且浮力等于重力');if(s.state==='sinking'&&buoyant>=weight)fail('下沉状态需要重力大于浮力');}
 if(s.kind==='experiment'){if(s.setup==='inclined_cart'){if(!s.cart)fail('斜面小车装置需要 cart 条件');else if(s.cart.times&&(s.cart.times.length!==s.cart.positions.length||s.cart.times.some((t:number,i:number)=>i>0&&t<=s.cart.times[i-1])))fail('实验位置与时刻须一一对应且时间递增');}else if(!s.apparatus.length)fail('实验装置需要器材');}
 if(s.kind==='function')for(const f of s.functions){if(f.domain&&(f.domain[0]<s.xRange[0]||f.domain[1]>s.xRange[1]))fail('函数定义域须位于绘图横轴范围内');}
 if(s.kind==='statistics'){
  if(['bar','line','numberline','scatter'].includes(s.chart)&&!s.data.length)fail('统计图需要数据');
  if(s.chart==='scatter'&&s.data.some((p:any)=>p.x===undefined))fail('散点图需要每个点的真实 x 坐标');
  if(s.chart==='line'&&s.data.some((p:any)=>p.x!==undefined)&&s.data.some((p:any,i:number)=>p.x===undefined||i>0&&p.x<=s.data[i-1].x))fail('数值折线图的横坐标须完整且递增');
  if(s.chart==='histogram'&&(!s.bins?.length||s.bins.some((b:any,i:number)=>b.to<=b.from||i>0&&b.from<s.bins[i-1].to)))fail('直方图需要有序且不重叠的区间，区间宽度须为正');
  if(s.chart==='boxplot'&&(!s.summary||[s.summary.min,s.summary.q1,s.summary.median,s.summary.q3,s.summary.max].some((v:number,i:number,a:number[])=>i>0&&v<a[i-1])))fail('箱线图的五数概括必须有序');
 }
 if(s.kind==='circuit'){
  if(!unique(s.components))fail('电路元件 ID 重复');
  for(const c of s.components){const a=s.nodes.find((n:any)=>n.id===c.from),b=s.nodes.find((n:any)=>n.id===c.to);if(a&&b&&Math.hypot(a.x-b.x,a.y-b.y)<1e-8)fail('电路元件的绘图端点重合');}
  const parent=new Map<string,string>(s.nodes.map((n:any)=>[n.id,n.id])),root=(v:string):string=>parent.get(v)===v?v:parent.has(v)?root(parent.get(v)!):v;
  for(const c of s.components)if(['wire','switch_closed','ammeter'].includes(c.kind))parent.set(root(c.from),root(c.to));
  for(const c of s.components){if(c.kind==='battery'&&root(c.from)===root(c.to))fail('电源两端被导线或理想电流表短接');if(c.kind==='voltmeter'&&root(c.from)===root(c.to))fail('电压表两端连接同一等势导线节点');}
 }
 return [...new Set(errors)];
}
