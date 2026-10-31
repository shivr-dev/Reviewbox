// Restricted arithmetic AST -> rational polynomials. Never eval/Function/JSXGraph JessieCode.
type Poly=number[];
type Expr={op:'constant';value:number}|{op:'x'}|{op:'+'|'-'|'*'|'/';a:Expr;b:Expr}|{op:'pow';a:Expr;exponent:number}|{op:'neg';a:Expr};
export type Rational={p:Poly;q:Poly;ast?:Expr};
function trim(p:Poly){while(p.length>1&&p.at(-1)===0)p.pop();if(p.length>65||p.some(v=>!Number.isFinite(v)||Math.abs(v)>1e30))throw new Error('函数过于复杂，不能可靠确定阴影边界');return p;}
const add=(a:Poly,b:Poly,sign=1)=>trim(Array.from({length:Math.max(a.length,b.length)},(_,i)=>(a[i]??0)+sign*(b[i]??0)));
function mul(a:Poly,b:Poly){const p=Array(a.length+b.length-1).fill(0);a.forEach((x,i)=>b.forEach((y,j)=>p[i+j]+=x*y));return trim(p);}
const derivative=(p:Poly)=>p.length===1?[0]:p.slice(1).map((v,i)=>v*(i+1));
const evalPoly=(p:Poly,x:number)=>p.reduceRight((v,c)=>v*x+c,0);
function combine(a:Rational,b:Rational,op:string):Rational{
 const ast=a.ast&&b.ast?{op:op as '+'|'-'|'*'|'/',a:a.ast,b:b.ast}:undefined;
 if(op==='+')return {p:add(mul(a.p,b.q),mul(b.p,a.q)),q:mul(a.q,b.q),ast};
 if(op==='-')return {p:add(mul(a.p,b.q),mul(b.p,a.q),-1),q:mul(a.q,b.q),ast};
 if(op==='*')return {p:mul(a.p,b.p),q:mul(a.q,b.q),ast};
 if(b.p.every(v=>v===0))throw new Error('函数分母不能恒为零');return {p:mul(a.p,b.q),q:mul(a.q,b.p),ast};
}
export function rationalExpression(expression:string):Rational{
 if(expression.length>250)throw new Error('函数表达式过长');const tokens=expression.match(/(?:\d*\.)?\d+(?:e[+-]?\d+)?|x|[()+\-*/^]/g)??[];
 if(tokens.join('')!==expression.replace(/\s/g,''))throw new Error('阴影仅支持经过校验的代数表达式');let i=0,steps=0;
 function atom():Rational{if(++steps>500)throw new Error('函数过于复杂');const t=tokens[i++];if(t==='('){const v=sum();if(tokens[i++]!==')')throw new Error('函数括号不匹配');return v;}if(t==='x')return {p:[0,1],q:[1],ast:{op:'x'}};if(t===undefined||!Number.isFinite(Number(t)))throw new Error('函数表达式不完整');return {p:[Number(t)],q:[1],ast:{op:'constant',value:Number(t)}};}
 function power():Rational{let a=atom();if(tokens[i]==='^'){i++;const b=unary();if(b.p.length!==1||b.q.length!==1)throw new Error('阴影边界不支持变量指数');const exp=b.p[0]/b.q[0];if(!Number.isInteger(exp)||Math.abs(exp)>8)throw new Error('阴影边界仅支持 -8 至 8 的整数指数');let r:Rational={p:[1],q:[1]};for(let j=0;j<Math.abs(exp);j++)r=combine(r,a,'*');const ast:Expr={op:'pow',a:a.ast!,exponent:exp};a=exp<0?{p:r.q,q:r.p,ast}:{...r,ast};}return a;}
 function unary():Rational{if(tokens[i]==='-'){i++;const a=unary();return {p:a.p.map(v=>-v),q:a.q,ast:{op:'neg',a:a.ast!}};}if(tokens[i]==='+'){i++;return unary();}return power();}
 function product():Rational{let a=unary();while(tokens[i]==='*'||tokens[i]==='/'){const op=tokens[i++];a=combine(a,unary(),op);}return a;}
 function sum():Rational{let a=product();while(tokens[i]==='+'||tokens[i]==='-'){const op=tokens[i++];a=combine(a,product(),op);}return a;}
 const result=sum();if(i!==tokens.length||result.p.length>13||result.q.length>13)throw new Error('函数边界无法在当前精度限制内求解');return result;
}
export const rationalValue=(r:Rational,x:number)=>evalPoly(r.p,x)/evalPoly(r.q,x);
export function rationalDerivative(r:Rational):Rational{return {p:add(mul(derivative(r.p),r.q),mul(r.p,derivative(r.q)),-1),q:mul(r.q,r.q)};}
type Interval=[number,number];
const bits=new DataView(new ArrayBuffer(8));
function adjacent(x:number,up:boolean){if(!Number.isFinite(x))return x;if(x===0)return up?Number.MIN_VALUE:-Number.MIN_VALUE;bits.setFloat64(0,x);let value=bits.getBigUint64(0);value+=(x>0)===up?BigInt(1):-BigInt(1);bits.setBigUint64(0,value);return bits.getFloat64(0);}
const iadd=(a:Interval,b:Interval):Interval=>[adjacent(a[0]+b[0],false),adjacent(a[1]+b[1],true)];
const ineg=(a:Interval):Interval=>[-a[1],-a[0]];
function imul(a:Interval,b:Interval):Interval{const c=[a[0]*b[0],a[0]*b[1],a[1]*b[0],a[1]*b[1]];return [adjacent(Math.min(...c),false),adjacent(Math.max(...c),true)];}
function inverse(a:Interval):Interval{if(a[0]<=0&&a[1]>=0)throw new Error('uncertain denominator');return [adjacent(1/a[1],false),adjacent(1/a[0],true)];}
type Jet={v:Interval;d:Interval;dd:Interval};
const constant=(x:number):Jet=>({v:[adjacent(x,false),adjacent(x,true)],d:[0,0],dd:[0,0]});
function productJet(a:Jet,b:Jet):Jet{return {v:imul(a.v,b.v),d:iadd(imul(a.d,b.v),imul(a.v,b.d)),dd:iadd(iadd(imul(a.dd,b.v),imul([2,2],imul(a.d,b.d))),imul(a.v,b.dd))};}
function inverseJet(a:Jet):Jet{const inv=inverse(a.v),square=imul(inv,inv);return {v:inv,d:ineg(imul(a.d,square)),dd:iadd(imul([2,2],imul(imul(a.d,a.d),imul(square,inv))),ineg(imul(a.dd,square)))};}
function jet(ast:Expr,x:Interval):Jet{
 if(ast.op==='constant')return constant(ast.value);if(ast.op==='x')return {v:x,d:[1,1],dd:[0,0]};const a=jet(ast.a,x);
 if(ast.op==='neg')return {v:ineg(a.v),d:ineg(a.d),dd:ineg(a.dd)};
 if(ast.op==='pow'){let p=constant(1);for(let i=0;i<Math.abs(ast.exponent);i++)p=productJet(p,a);return ast.exponent<0?inverseJet(p):p;}
 const b=jet(ast.b,x);if(ast.op==='*')return productJet(a,b);if(ast.op==='/')return productJet(a,inverseJet(b));const sign=ast.op==='-'?ineg:(v:Interval)=>v;return {v:iadd(a.v,sign(b.v)),d:iadd(a.d,sign(b.d)),dd:iadd(a.dd,sign(b.dd))};
}
/** Linear interpolation error <= max|f''| * h² / 8, certified with interval arithmetic. */
export function certifiedCurve(expression:string,range:[number,number],tolerance=.001):[number,number][]{
 const r=rationalExpression(expression),out:[number,number][]=[],[start,end]=range;
 if(!(end>start)||tolerance<=0)throw new Error('函数阴影范围无效');
 function segment(a:number,b:number,depth:number){
  if(out.length>8192)throw new Error('曲线精度要求超出限制，请缩小阴影范围');
  const fa=rationalValue(r,a),fb=rationalValue(r,b),mid=(a+b)/2,fm=rationalValue(r,mid);let curvature:number|null=null,endpointError=Infinity;
  try{const all=jet(r.ast!,[a,b]),ja=jet(r.ast!,[a,a]).v,jb=jet(r.ast!,[b,b]).v;curvature=Math.max(...all.dd.map(Math.abs));endpointError=Math.max(Math.abs(fa-ja[0]),Math.abs(fa-ja[1]),Math.abs(fb-jb[0]),Math.abs(fb-jb[1]));}catch{}
  if(!Number.isFinite(fa)||!Number.isFinite(fb)||!Number.isFinite(fm))throw new Error('阴影边界包含未定义点或渐近线，请分段给出范围');
  if(curvature!==null&&endpointError+curvature*(b-a)**2/8<=tolerance){if(!out.length)out.push([a,fa]);out.push([b,fb]);return;}
  if(depth>=22)throw new Error('无法可靠确定阴影边界，请分段或保留原图');
  segment(a,mid,depth+1);segment(mid,b,depth+1);
 }segment(start,end,0);return out;
}
export function cubicCurve(expression:string,range:[number,number]){
 certifiedCurve(expression,range,.0005);
 const r=rationalExpression(expression);if(r.q.length!==1||r.p.length>4)return null;const d=rationalDerivative(r),[a,b]=range,h=(b-a)/3;
 return [[a,rationalValue(r,a)],[a+h,rationalValue(r,a)+rationalValue(d,a)*h],[b-h,rationalValue(r,b)-rationalValue(d,b)*h],[b,rationalValue(r,b)]] as [number,number][];
}
