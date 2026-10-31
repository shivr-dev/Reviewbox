import {mathInputProblem} from './math-input-format';
export type MathVerificationOptions={studentFormat?:'text'|'latex';referenceFormat?:'text'|'latex';nonzero?:string[];nonnegative?:string[];positive?:string[];tolerance?:number;units?:string};
export type MathVerification={status:'equivalent'|'not-equivalent'|'undetermined';method:string;assumptions:string[];tolerance?:number;reason?:string;studentMathJson?:unknown;referenceMathJson?:unknown};
type Ast=unknown;
const supported=new Set(['Add','Subtract','Negate','Multiply','Divide','Rational','Power','Sqrt','Root','Abs','Equal','Delimiter','InvisibleOperator','Square']);
function walk(value:Ast,visit:(op:string,args:Ast[])=>void,depth=0){if(depth>20)throw new Error('表达式嵌套过深');if(Array.isArray(value)){visit(String(value[0]),value.slice(1));value.slice(1).forEach(v=>walk(v,visit,depth+1));}}
function normalInput(input:string){return input.trim().replace(/^\$\$?|\$\$?$/g,'').replace(/[−–]/g,'-').replace(/²/g,'^2').replace(/³/g,'^3').replace(/×/g,'\\cdot ').replace(/÷/g,'/');}
export async function verifyMathCore(studentAnswer:string,referenceAnswer:string,options:MathVerificationOptions={}):Promise<MathVerification>{
 const assumptions=[...(options.nonzero??[]).map(v=>v+' ≠ 0'),...(options.nonnegative??[]).map(v=>v+' ≥ 0'),...(options.positive??[]).map(v=>v+' > 0')];
 const base={method:'compute-engine',assumptions,tolerance:options.tolerance};
 const unknown=(reason:string):MathVerification=>({...base,status:'undetermined',reason});
 try{
  for(const value of [studentAnswer,referenceAnswer]){if(!value.trim()||value.length>1000)throw new Error('仅核验 1000 字符以内的完整表达式');const problem=mathInputProblem(value);if(problem)throw new Error(problem);if((value.match(/[+*/^\\]/g)??[]).length>100)throw new Error('表达式运算过多');}
  if(options.units||/\\(?:mathrm|text|operatorname)\s*\{/.test(studentAnswer+referenceAnswer))return unknown('含单位或量纲，需要按题目单位人工复核；未自动换算');
  const {ComputeEngine}=await import('@cortex-js/compute-engine'),ce=new ComputeEngine();
  return ce.withTimeLimit({ms:180,label:'reviewbox-answer-check'},()=>{
   for(const name of [...(options.nonzero??[]),...(options.nonnegative??[]),...(options.positive??[])])if(!/^[a-zA-Z]$/.test(name))throw new Error('假设只能引用单字母变量');
   for(const name of options.nonzero??[])ce.assume(name+'\\ne 0');for(const name of options.nonnegative??[])ce.assume(name+'\\ge0');for(const name of options.positive??[])ce.assume(name+'>0');
   const a=ce.parse(normalInput(studentAnswer),{form:'raw'}),b=ce.parse(normalInput(referenceAnswer),{form:'raw'});
   if(a.errors.length||b.errors.length)return unknown('表达式不完整或语法不受支持');
   const astA=a.json,astB=b.json,vars=[...new Set([...a.unknowns,...b.unknowns])];if(vars.some(v=>!/^([a-zA-Z]|[α-ωΑ-Ω])$/.test(v)))return unknown('含未声明的文字、单位或函数');
   let count=0;for(const ast of [astA,astB])walk(ast,(op,args)=>{if(++count>160||!supported.has(op))throw new Error('超出保守符号核验范围');if(op==='Power'&&(!(typeof args[1]==='number')||Math.abs(args[1])>12))throw new Error('只自动核验有界的常数次幂');});
   const key=(v:Ast)=>JSON.stringify(ce.box(v as never,{form:'canonical'}).json);
   const domains=(ast:Ast)=>{const restrictions=new Set<string>();walk(ast,(op,args)=>{
    if(op==='Divide'||op==='Rational'){
     const den=ce.box(args[1] as never);if(den.unknowns.length===0){if(den.evaluate().isEqual(0)!==false)throw new Error('分母为零或不能确认非零');}
     else if(typeof args[1]==='string'&&[...(options.nonzero??[]),...(options.positive??[])].includes(args[1])){}else restrictions.add('非零:'+key(args[1]));
    }
    if(op==='Power'&&typeof args[1]==='number'&&args[1]<0){const v=args[0];if(typeof v==='string'&&[...(options.nonzero??[]),...(options.positive??[])].includes(v)){}else restrictions.add('非零:'+key(v));}
    if(['Sqrt','Root','Abs'].includes(op)&&ce.box(args[0] as never).unknowns.length){
     // A squared real variable is nonnegative; |x|=x still needs sign evidence.
     if(op==='Sqrt'&&Array.isArray(args[0])&&args[0][0]==='Power'&&args[0][2]===2){const v=args[0][1];if(typeof v==='string'&&[...(options.nonnegative??[]),...(options.positive??[])].includes(v))return;}
     restrictions.add('取值范围:'+op+':'+key(args[0]));
    }
   });return [...restrictions].sort();};
   const da=domains(astA),db=domains(astB);
   if(JSON.stringify(da)!==JSON.stringify(db))return unknown('两式的定义域或根式/绝对值条件不同，需补充非零、非负等假设');
   const knownNonnegative=new Set([...(options.nonnegative??[]),...(options.positive??[])]);
   const signed=(ast:Ast):Ast=>{if(!Array.isArray(ast))return ast;const args=ast.slice(1).map(signed);if(ast[0]==='Abs'&&typeof args[0]==='string'&&knownNonnegative.has(args[0]))return args[0];if(ast[0]==='Sqrt'&&Array.isArray(args[0])&&args[0][0]==='Power'&&args[0][2]===2&&knownNonnegative.has(args[0][1]))return args[0][1];return [ast[0],...args];};
   const ac=ce.box(signed(astA) as never),bc=ce.box(signed(astB) as never),resultBase={...base,assumptions:[...assumptions,...da],studentMathJson:astA,referenceMathJson:astB};
   if(ac.isIdenticallyEqual(bc)===true)return {...resultBase,status:'equivalent',method:'symbolic-identity'};
   if(!vars.length){const av=ac.N(),bv=bc.N();if(av.im===0&&bv.im===0&&Number.isFinite(av.re)&&Number.isFinite(bv.re)){
    if(options.tolerance!==undefined){if(!Number.isFinite(options.tolerance)||options.tolerance<0||options.tolerance>.1)throw new Error('误差容限无效');return {...resultBase,status:Math.abs(av.re-bv.re)<=options.tolerance?'equivalent':'not-equivalent',method:'explicit-numeric-tolerance'};}
    // A finite exact constant difference certifies inequality, not merely failed equality.
    const d=ce.box(['Subtract',ac.json,bc.json]).simplify();if(d.isEqual(0)===false)return {...resultBase,status:'not-equivalent',method:'exact-constant-difference'};
   }}
   // An exact counterexample disproves identity. Samples NEVER establish equivalence.
   for(const n of [0,1,2,-1]){
    if(assumptions.length&&n<=0)continue;
    const substitutions=Object.fromEntries(vars.map((v,i)=>[v,n+i]));
    const x=ac.subs(substitutions).evaluate(),y=bc.subs(substitutions).evaluate();
    if(x.isValid&&y.isValid&&x.unknowns.length===0&&y.unknowns.length===0&&x.isEqual(y)===false&&Number.isFinite(x.re)&&Number.isFinite(y.re))return {...resultBase,status:'not-equivalent',method:'exact-counterexample',reason:'存在满足所声明条件的精确反例'};
   }
   return {...resultBase,status:'undetermined',reason:'未能证明等价或不等价，请按原评分流程或人工复核'};
  });
 }catch(e){return unknown(e instanceof Error?e.message:'核验不可用');}
}
