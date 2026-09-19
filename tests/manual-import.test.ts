import test from 'node:test';
import assert from 'node:assert/strict';
import {CHINESE_IMPORT_TYPES,GENERAL_IMPORT_TYPES,manualExample,parseManualImport} from '../lib/manual-import';
import {objectiveScore,isPinyin} from '../lib/question-tools';
test('every Chinese manual import format produces linked questions and a specific skill',()=>{
 for(const spec of CHINESE_IMPORT_TYPES){const value=parseManualImport(manualExample(spec.id,'chinese'),'chinese',spec.id,'语文测试');assert.ok(value.questions.length);for(const q of value.questions){assert.equal(q.subject,'chinese');assert.equal(q.nodeId,value.node.id);assert.equal(q.skillId,value.node.skills[0].id);assert.equal(q.type,spec.type);}}
 for(const spec of GENERAL_IMPORT_TYPES)assert.ok(parseManualImport(manualExample(spec.id,'math'),'math',spec.id,'数学').questions.length);
});
test('pinyin bulk import preserves manual recall and does not reuse previous IDs',()=>{
 const source='jǔ sàng｜沮丧｜灰心失望。\nláng jí\t狼藉\t杂乱';const a=parseManualImport(source,'chinese','pinyin','字词'),b=parseManualImport(source,'chinese','pinyin','字词');assert.equal(a.questions.length,2);assert.ok(a.questions.every(isPinyin));assert.equal(a.questions[0].prompt,'jǔ sàng');assert.equal(a.questions[0].answer,'沮丧');assert.notEqual(a.questions[0].id,b.questions[0].id);
});
test('manual import keeps multiline source and rubric, validates choices and matching',()=>{
 const text=manualExample('translation','chinese')+'\n---\n'+manualExample('translation','chinese');const a=parseManualImport(text,'chinese','translation','文言文');assert.equal(a.questions.length,2);assert.ok(a.questions[0].rubric?.[0].description.includes('时习'));
 const m=parseManualImport(manualExample('matching','chinese'),'chinese','matching','作者');assert.equal(objectiveScore(m.questions[0],m.questions[0].answer),1);
 assert.throws(()=>parseManualImport('题干：测试\nA. 是\nB. 否\n答案：C','chinese','choice',''),/缺少/);
 assert.throws(()=>parseManualImport('拼音无分隔','chinese','pinyin',''),/第 1 行/);
});
