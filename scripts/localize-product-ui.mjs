import {readFileSync as read,writeFileSync as write,readdirSync,mkdirSync} from 'node:fs';
import ts from 'typescript';
const chinese=/[\u3400-\u9fff]/;
const files=readdirSync('components').filter(f=>f.endsWith('.tsx')).map(f=>'components/'+f);
const namespace=f=>/you-view|clear-data|profile/.test(f)?'settings':/pack|library|import|manual-import|content-review/.test(f)?'library':/knowledge-map|subjects/.test(f)?'subjects':/grade|grading|rubric|teaching-review/.test(f)?'grading':/study-plan|auto-practice|onboarding/.test(f)?'planner':/study-view|math-answer|question-review|pressure|assessment|remediation|course-room/.test(f)?'study':/exam|results|analytics/.test(f)?'results':/workshop|equipment|adventure|rewards|chest|home-item|learning-game/.test(f)?'workshop':/watch|device/.test(f)?'devices':/home-view/.test(f)?'dashboard':'common';
const catalogs={};const edits=[];
function add(ns,key){if(!chinese.test(key)||key.length>600)return false;catalogs[ns]??={};catalogs[ns][key]=key;return true;}
for(const file of files){let source=read(file,'utf8'),patches=[],ns=namespace(file);const sf=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 function replace(n,key,wrap=false){if(add(ns,key))patches.push({start:n.getStart(sf),end:n.end,text:(wrap?'{':'')+`tr(${JSON.stringify(ns+':'+key)})`+(wrap?'}':'')});}
 function visit(n){
  if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&n.expression.text==='tr'&&ts.isStringLiteral(n.arguments[0])){const key=n.arguments[0].text,colon=key.indexOf(':');if(colon>=0)add(key.slice(0,colon),key.slice(colon+1));}
  if(ts.isJsxText(n)){const key=n.text.replace(/\s*\r?\n\s*/g,' ').trim();if(add(ns,key))patches.push({start:n.pos,end:n.end,text:`{tr(${JSON.stringify(ns+':'+key)})}`});}
  if(ts.isJsxAttribute(n)&&n.initializer&&ts.isStringLiteral(n.initializer)&&['title','description','note','placeholder','aria-label','label'].includes(n.name.text))replace(n.initializer,n.initializer.text,true);
  // Translate literal outcomes in render-only conditionals; never enum comparisons.
  if(ts.isJsxExpression(n)&&n.expression){const expr=n.expression;if(ts.isStringLiteral(expr))replace(expr,expr.text);if(ts.isConditionalExpression(expr)){for(const part of [expr.whenTrue,expr.whenFalse])if(ts.isStringLiteral(part))replace(part,part.text);}}
  // Explicit, authored UI feedback only. No AI response or imported text is touched.
  if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&['notify','setError','setNotice'].includes(n.expression.text)&&n.arguments[0]&&ts.isStringLiteral(n.arguments[0]))replace(n.arguments[0],n.arguments[0].text);
  // Static tuples are UI option lists. Their stable first-column IDs stay intact.
  if(ts.isArrayLiteralExpression(n)&&n.elements.length>=2&&ts.isStringLiteral(n.elements[0])&&!chinese.test(n.elements[0].text)&&n.elements.every(x=>ts.isStringLiteral(x))){for(const item of n.elements.slice(1))if(ts.isStringLiteral(item))replace(item,item.text);}
  ts.forEachChild(n,visit);
 }visit(sf);
 const unique=[...new Map(patches.map(p=>[p.start,p])).values()].sort((a,b)=>b.start-a.start);for(const patch of unique)source=source.slice(0,patch.start)+patch.text+source.slice(patch.end);
 if(unique.length&&!/import\s*\{[^}]*\btr\b[^}]*\}\s*from\s*['"]@\/lib\/i18n['"]/.test(source)){const marker=source.startsWith("'use client';")?"'use client';":"";source=marker?source.replace(marker,marker+"\nimport {tr} from '@/lib/i18n';"):"import {tr} from '@/lib/i18n';\n"+source;}
 if(unique.length){write(file,source);edits.push([file,unique.length]);}
}
for(const [ns,values] of Object.entries(catalogs)){const path='lib/i18n/locales/zh-CN/'+ns+'.json';let old={};try{old=JSON.parse(read(path,'utf8'));}catch{}write(path,JSON.stringify({...old,...values},null,2)+'\n');}
const locales=['zh-TW','ja','ko','en','es','fr','ru'];for(const l of locales){mkdirSync('lib/i18n/locales/'+l,{recursive:true});for(const ns of Object.keys(catalogs)){const path='lib/i18n/locales/'+l+'/'+ns+'.json';try{read(path);}catch{write(path,'{}\n');}}}
console.log(JSON.stringify({files:edits.length,keys:Object.fromEntries(Object.entries(catalogs).map(([k,v])=>[k,Object.keys(v).length]))}));
