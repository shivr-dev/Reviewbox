import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveNaviContext,verifyNaviAnswer} from '../lib/navi-context';
const data:any={questions:[{id:'q1',prompt:'A question',nodeId:'n1',answer:'42',explanation:'Reason'}],nodes:[],events:[{private:'never send'}],exams:[{score:99}],materials:[],packs:[],jobs:[],notes:[]};
test('Navi selects one real source without personal evidence or scores',()=>{
 const c=resolveNaviContext(data,{type:'question',id:'q1'});assert.deepEqual(c.related_question_ids,['q1']);assert.ok(c.relevant_content.includes('A question'));assert.ok(!JSON.stringify(c).includes('never send'));assert.ok(!JSON.stringify(c).includes('score'));assert.throws(()=>resolveNaviContext(data,{type:'question',id:'another-account'}));
});
test('Navi rejects invented source IDs, versions and quotations',()=>{
 const c=resolveNaviContext(data,{type:'question',id:'q1'});const answer={reply:'An explanation',supplementary:true,citations:[{source_id:'q1',source_version:c.source_version,quote:'A question'}]};assert.equal(verifyNaviAnswer(answer,[c]).citations.length,1);
 for(const change of [{source_id:'private-other'},{source_version:'invented'},{quote:'invented textbook page'}])assert.throws(()=>verifyNaviAnswer({...answer,citations:[{...answer.citations[0],...change}]},[c]));
});
test('pack context does not dump the pack and cannot address unrelated questions',()=>{
 const d={...data,packs:[{id:'p1',version:'1',title:'Pack',questionIds:['q1']}]};assert.ok(!resolveNaviContext(d,{type:'pack',id:'p1'}).relevant_content.includes('A question'));assert.throws(()=>resolveNaviContext(d,{type:'pack',id:'p1',questionId:'other'}));assert.ok(resolveNaviContext(d,{type:'pack',id:'p1',questionId:'q1'}).relevant_content.includes('A question'));
});
