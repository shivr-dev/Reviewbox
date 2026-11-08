import type {StudyData} from './model';
import {computeMastery} from './engine';
import {dailyStudyPlan,weeklyLearningGpa} from './study-assistant';
import {memoryFingerprint} from './learning-intelligence';
import {examGpa} from './exam-outcomes';
/** Pure, read-only projection. No new mastery model, no simulated score promises. */
export function learningTwin(data:StudyData,minutes:number,now=Date.now()){
 const snapshot=structuredClone(data);const assistant=(snapshot.settings as any).assistant??{};
 snapshot.settings={...snapshot.settings,dailyMinutes:minutes,assistant:{...assistant,dailyMinutes:minutes}} as StudyData['settings'];
 const states=Object.values(computeMastery(data.nodes,data.events));
 const plan=dailyStudyPlan(snapshot,now);
 return {basis:'existing-reviewbox-engines',at:new Date(now).toISOString(),evidence:{answers:data.events.length,days:new Set(data.events.map(e=>e.localDay)).size,skills:states.length,observed:states.filter(s=>s.attemptCount>0).length},gpa:examGpa(data,now),weekly:weeklyLearningGpa(data,now),memory:memoryFingerprint(data,now),plan:{minutes:plan.minutes,questions:plan.queue.length,stages:plan.stages,status:plan.status,missingSubjects:plan.missingSubjects},assumption:{dailyMinutes:minutes},writes:0};
}
