import test from 'node:test';
import assert from 'node:assert/strict';
import {knowledgeGraph} from '../lib/knowledge-map';
import {adaptReference,searchTerms} from '../lib/reference-pool';
import {resolveLocale,supportedLocale} from '../lib/i18n';
import fs from 'node:fs/promises';

const node=(id:string,extra:object={})=>({id,subject:'math',title:id,skills:[{id:'solve',title:'求解',difficulty:2}],prerequisites:[],relatedNodes:[],chapter:'方程',...extra});
test('map only draws authored chapter, related and prerequisite links, and filters without dangling endpoints',()=>{
 const data:any={nodes:[node('a'),node('b',{prerequisites:['a','not-installed']}),node('c',{relatedNodes:['a']})]};
 const graph=knowledgeGraph(data,{});assert.equal(graph.missingReferences[0],'not-installed');
 assert.equal(graph.elements.filter(e=>e.data.kind==='requires').length,1);
 assert.equal(graph.elements.filter(e=>e.data.kind==='related').length,1);
 assert.equal(graph.elements.filter(e=>e.data.kind==='membership').length,3);
 const filtered=knowledgeGraph(data,{}, {query:'b'}),ids=new Set(filtered.elements.filter(e=>!e.data.source).map(e=>e.data.id));
 assert.ok(filtered.elements.filter(e=>e.data.source).every(e=>ids.has(e.data.source)&&ids.has(e.data.target)));
 const unrelated=knowledgeGraph({nodes:[node('x',{chapter:''}),node('y',{chapter:''})]} as any,{});
 assert.equal(unrelated.elements.filter(e=>e.data.source).length,0);
});
test('reference adapters preserve provenance and unsafe or incomplete image data cannot become text-reviewed questions',async()=>{
 const raw={question:'求二次函数的顶点',answer:['D'],options:[{label:'D',text:'(2,3)'}],subject:'数学',id:'original'};
 const k=await adaptReference('k12',raw,'training/train.jsonl',1);assert.equal(k.subject,'math');assert.equal(k.options[0],'D (2,3)');assert.equal(k.provenance[0].scope,'private');
 const duplicate=await adaptReference('k12',raw,'training/train.parquet',8);assert.equal(k.content_hash,duplicate.content_hash);assert.notEqual(k.provenance[0].file,duplicate.provenance[0].file);
 const image=await adaptReference('k12',{...raw,images:[{path:'images/abcd.png'}]},'raw.parquet',2);assert.equal(image.qa_status,'images-required');
 await assert.rejects(()=>adaptReference('k12',{...raw,images:[{path:'../secret'}]},'raw.parquet',2),/Unsafe/);
 const c=await adaptReference('cjeval',{subject:'初中数学',ques_content:'计算一次方程',ques_answer:['x=2'],ques_analyze:'移项'},'valid/valid_math.json',4);assert.equal(c.answer,'x=2');assert.equal(c.provenance[0].rights_status,'research-only');
 assert.ok(searchTerms('二次函数 vertex').includes('函数'));
});
test('all eight locales have identical keys and preserve interpolation tokens; locale preference is stable',async()=>{
 const root='lib/i18n/locales',locales=['zh-CN','zh-TW','ja','ko','en','es','fr','ru'];
 const names=(await fs.readdir(root+'/zh-CN')).filter(n=>n.endsWith('.json'));
 for(const name of names){const base=JSON.parse(await fs.readFile(root+'/zh-CN/'+name,'utf8'));for(const locale of locales){const entries=JSON.parse(await fs.readFile(root+'/'+locale+'/'+name,'utf8'));assert.deepEqual(Object.keys(entries).sort(),Object.keys(base).sort(),locale+':'+name);for(const key of Object.keys(base)){assert.ok(entries[key]?.trim(),locale+':'+key);assert.deepEqual([...base[key].matchAll(/\{\{(.*?)\}\}/g)].map(m=>m[1]).sort(),[...entries[key].matchAll(/\{\{(.*?)\}\}/g)].map(m=>m[1]).sort(),locale+':'+key);}}}
 assert.equal(resolveLocale('fr',['en-US']),'fr');assert.equal(resolveLocale(undefined,['ja-JP']),'ja');assert.equal(supportedLocale('zh-Hant-HK'),'zh-TW');assert.equal(resolveLocale(undefined,['unsupported']),'zh-CN');
});
