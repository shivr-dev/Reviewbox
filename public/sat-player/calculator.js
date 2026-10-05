/* Offline arithmetic/graph demonstration, not the Desmos engine.
   Recursive-descent parsing deliberately avoids eval and Function. */
window.SATMath = (()=>{
 function calculate(expression,x=0){
  const cleaned=expression.toLowerCase().replace(/^\s*y\s*=/,'').replace(/π/g,'pi').replace(/×/g,'*').replace(/÷/g,'/').replace(/−/g,'-').replace(/\s/g,'');
  const tokens=cleaned.match(/(?:\d+(?:\.\d*)?|\.\d+)|[a-z]+|[+\-*/^()%]/g)||[];
  if(tokens.join('')!==cleaned||tokens.length>150)throw Error('Check the expression');let pos=0;
  function atom(){let t=tokens[pos++];if(t==='('){const v=sum();if(tokens[pos++]!==')')throw Error('Missing )');return v;}if(t==='x')return x;if(t==='pi')return Math.PI;if(t==='e')return Math.E;
   const funcs={sqrt:Math.sqrt,sin:v=>Math.sin(v*Math.PI/180),cos:v=>Math.cos(v*Math.PI/180),tan:v=>Math.tan(v*Math.PI/180),ln:Math.log,log:Math.log10,abs:Math.abs};
   if(funcs[t]){if(tokens[pos++]!=='(')throw Error('Use parentheses');const v=sum();if(tokens[pos++]!==')')throw Error('Missing )');return funcs[t](v);}if(t!==undefined&&!Number.isNaN(Number(t)))return Number(t);throw Error('Check the expression');}
  function power(){let a=atom();if(tokens[pos]==='^'){pos++;a=a**unary();}if(tokens[pos]==='%'){pos++;a/=100;}return a;}
  function unary(){if(tokens[pos]==='+'){pos++;return unary();}if(tokens[pos]==='-'){pos++;return -unary();}return power();}
  function product(){let v=unary();while(pos<tokens.length){const t=tokens[pos];if(t==='*'||t==='/'){pos++;const r=unary();v=t==='*'?v*r:v/r;}else if(t==='('||t==='x'||t==='pi'||t==='e'||/^[a-z]+$/.test(t)){v*=unary();}else break;}return v;}
  function sum(){let v=product();while(tokens[pos]==='+'||tokens[pos]==='-'){const t=tokens[pos++],r=product();v=t==='+'?v+r:v-r;}return v;}
  const result=sum();if(pos!==tokens.length||!Number.isFinite(result))throw Error('Undefined');return result;
 }
 function graph(expression){let path='',last=null;for(let i=0;i<=500;i++){const x=(i-250)/25;try{const y=calculate(expression,x),px=i,py=130-y*20;if(py < -1000||py>1260){last=null;continue;}path+=(last!==null&&Math.abs(py-last)<200?'L':'M')+px.toFixed(1)+','+py.toFixed(1)+' ';last=py;}catch{last=null;}}return path;}
 return {calculate,graph};
})();
