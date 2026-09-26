import test from 'node:test';
import assert from 'node:assert/strict';
import {CHINESE_IMPORT_TYPES,GENERAL_IMPORT_TYPES,manualExample,parseManualImport} from '../lib/manual-import';
import {objectiveScore,isPinyin} from '../lib/question-tools';
import {pinyinCollections,pinyinPracticeQueue,questionTopicTitle} from '../lib/pinyin-collections';
import {buildQueue} from '../lib/engine';
test('every Chinese manual import format produces linked questions and a specific skill',()=>{
 for(const spec of CHINESE_IMPORT_TYPES){const value=parseManualImport(manualExample(spec.id,'chinese'),'chinese',spec.id,'语文测试');assert.ok(value.questions.length);for(const q of value.questions){const node=value.nodes.find((item)=>item.id===q.nodeId);assert.ok(node);assert.equal(q.subject,'chinese');assert.equal(q.skillId,node.skills[0].id);assert.equal(q.type,spec.type);}}
 for(const spec of GENERAL_IMPORT_TYPES)assert.ok(parseManualImport(manualExample(spec.id,'math'),'math',spec.id,'数学').questions.length);
});
test('pinyin import makes a collection with separate word mastery and full-session coverage',()=>{
 const source='jǔ sàng｜沮丧｜灰心失望。\nláng jí\t狼藉\t杂乱';const a=parseManualImport(source,'chinese','pinyin','藤野先生字词'),b=parseManualImport(source,'chinese','pinyin','藤野先生字词');assert.equal(a.questions.length,2);assert.equal(a.nodes.length,2);assert.ok(a.questions.every(isPinyin));assert.equal(a.questions[0].prompt,'jǔ sàng');assert.equal(a.questions[0].answer,'沮丧');assert.equal(a.questions[0].explanation,'');assert.notEqual(a.questions[0].nodeId,a.questions[1].nodeId);assert.notEqual(a.questions[0].id,b.questions[0].id);
 const collections=pinyinCollections(a.questions,a.nodes);assert.deepEqual(collections.map((item)=>[item.title,item.count]),[['藤野先生字词',2]]);assert.equal(pinyinPracticeQueue(a.questions,collections[0].id).length,2);assert.equal(questionTopicTitle(a.questions[0],a.nodes[0]),'藤野先生字词');
 const full=parseManualImport(Array.from({length:30},(_,i)=>`cí ${i}｜词${i}`).join('\n'),'chinese','pinyin','藤野先生字词');assert.equal(pinyinPracticeQueue(full.questions,full.questions[0].collectionId).length,30);assert.equal(new Set(full.questions.map((q)=>q.nodeId)).size,30);
});
test('multi-subject review queue respects selected subjects',()=>{
 const chinese=parseManualImport('láng jí｜狼藉','chinese','pinyin','藤野先生字词');
 const math=parseManualImport(manualExample('choice','math'),'math','choice','数学');
 const data={nodes:[...chinese.nodes,...math.nodes],questions:[...chinese.questions,...math.questions],events:[],exams:[],notes:[],materials:[],tests:[],packs:[],settings:{dailyMinutes:20,name:'测试',surprise:false}};
 const both=buildQueue(data,{subjects:['chinese','math'],practice:true,limit:10});
 assert.deepEqual(new Set(both.map((item)=>item.question.subject)),new Set(['chinese','math']));
 assert.ok(buildQueue(data,{subjects:['math'],practice:true,limit:10}).every((item)=>item.question.subject==='math'));
});
test('manual import keeps multiline source and rubric, validates choices and matching',()=>{
 const text=manualExample('translation','chinese')+'\n---\n'+manualExample('translation','chinese');const a=parseManualImport(text,'chinese','translation','文言文');assert.equal(a.questions.length,2);assert.ok(a.questions[0].rubric?.[0].description.includes('时习'));
 const m=parseManualImport(manualExample('matching','chinese'),'chinese','matching','作者');assert.equal(objectiveScore(m.questions[0],m.questions[0].answer),1);
 assert.throws(()=>parseManualImport('题干：测试\nA. 是\nB. 否\n答案：C','chinese','choice',''),/缺少/);
 assert.throws(()=>parseManualImport('拼音无分隔','chinese','pinyin',''),/第 1 行/);
});
