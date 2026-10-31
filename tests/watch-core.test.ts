import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,attempt,schoolExam} from './study-plan-fixtures';
import {watchCore,watchAnswerEvent,type WatchAnswer} from '../lib/watch-core';
import {examGpa} from '../lib/exam-outcomes';
import {learningGame} from '../lib/learning-game';
import {projectRecords} from '../lib/record-projection';
import type {LocalRecord,StudyData} from '../lib/model';
import {createWatchGateway,deviceHash} from '../lib/watch-gateway';
import {isWatchBrowser,validWatchRelease} from '../lib/watch-platform';
import {startWatchSession,answerWatchSession,finishWatchSession} from '../lib/watch-session';
import {studyAgenda} from '../lib/study-orchestrator';
import {sessionForView} from '../lib/session-view';
import {buildWatchPackage,watchPackageRecords} from '../lib/watch-package';
const now=Date.parse('2026-10-25T03:00:00Z');
function records(d:StudyData):LocalRecord[] {const rows:LocalRecord[] = (['node','question','event','exam','note','material','test','job'] as const).flatMap(kind=>{
 const list:any[] = ({node:d.nodes,question:d.questions,event:d.events,exam:d.exams,note:d.notes,material:d.materials,test:d.tests,job:d.jobs??[]})[kind];
 return list.map(payload=>({id:payload.id,kind,payload,updated_at:new Date(now).toISOString(),deleted:false}));
});rows.push({id:'setting',kind:'setting',payload:d.settings,updated_at:new Date(now).toISOString(),deleted:false});return rows;}
const input=(d:StudyData):WatchAnswer=>({eventId:'watch-event:device:attempt-1',sessionId:'watch-session:one',questionId:d.questions[0].id,answer:'A',occurredAt:new Date(now).toISOString(),displayedAt:new Date(now-15000).toISOString(),revealedAt:new Date(now-1000).toISOString(),activeThinkMs:13000,wallTimeMs:15000,idleMs:2000,timeZone:'Asia/Shanghai'});
test('native projection keeps real GPA distinct and matches web XP after duplicate offline delivery',()=>{
 const d=fixture();d.exams=[{...schoolExam(d,now,-3),result:{score:83,maxScore:100,credits:2,recordedAt:new Date(now-10000).toISOString()}}];
 const e=watchAnswerEvent(d,input(d),now);d.events=[e,e];
 const rows=records(d), snapshot=watchCore({op:'snapshot',records:rows,now}) as any;
 assert.equal(snapshot.gpa.value,examGpa(d,now).value);assert.equal(snapshot.game.xp,learningGame(d,now).totalXP);
 assert.equal(snapshot.weeklyGpa.value,null);assert.equal(snapshot.weeklyGpa.label,'学习 GPA（非官方成绩）');
 assert.equal(snapshot.game.xp,learningGame({...d,events:[e]},now).totalXP);
});
test('watch objective answers use the shared scorer and cannot inject mastery or a fabricated correct score',()=>{
 const d=fixture(), forged={...input(d),answer:'B',score:1,mastery:1} as WatchAnswer;
 const e=watchAnswerEvent(d,forged,now);assert.equal(e.score,0);assert.equal(e.outcome,'wrong');assert.equal((e as any).mastery,undefined);
 assert.throws(()=>watchAnswerEvent({...d,questions:d.questions.map(q=>({...q,reviewStatus:'paused' as const}))},input(d),now),/暂停/);
 assert.throws(()=>watchAnswerEvent(d,{...input(d),activeThinkMs:20000},now),/时间/);
 const recall={...d,questions:[{...d.questions[0],type:'recall'}]};
 assert.throws(()=>watchAnswerEvent(recall,input(d),now),/手动检查/);
 assert.equal(watchAnswerEvent(recall,{...input(d),selfOutcome:'unsure'},now).score,.5);
});
test('offline answer days retain the watch timezone when the gateway runs in UTC',()=>{
 const d=fixture(),at=Date.parse('2026-10-24T17:00:00Z');
 const e=watchAnswerEvent(d,{...input(d),occurredAt:new Date(at).toISOString(),displayedAt:new Date(at-15000).toISOString(),revealedAt:new Date(at-1000).toISOString()},now);
 assert.equal(e.localDay,'2026-10-25');
 assert.throws(()=>watchAnswerEvent(d,{...input(d),timeZone:'invalid-zone'},now));
});
test('shared record projection hydrates course sections, ignores tombstones and preserves quality exclusions',()=>{
 const d=fixture(), rows=records(d);rows.push({id:'gone',kind:'question',deleted:true,updated_at:new Date(now).toISOString(),payload:{...d.questions[0],id:'gone'}});
 const q=d.questions[0];rows.push({id:'pause',kind:'job',updated_at:new Date(now).toISOString(),deleted:false,payload:{id:'pause',kind:'question-review',questionId:q.id,action:'pause',original:q,reason:'test',at:new Date(now).toISOString(),excludedEventIds:[]}});
 const result=projectRecords(rows);assert.equal(result.questions.some(q=>q.id==='gone'),false);assert.equal(result.questions.find(x=>x.id===q.id)?.reviewStatus,'paused');
});

test('device gateway authenticates the web JWT with Auth and ignores request-supplied account identities',async()=>{
 let rpc:any;
 const fetcher=async(url:any,init:any)=>{if(String(url).endsWith('/auth/v1/user')){assert.equal(init.headers.Authorization,'Bearer real-session');return Response.json({id:'verified-owner'});}rpc=JSON.parse(init.body);return Response.json({devices:[]});};
 const gateway=createWatchGateway({url:'https://test.invalid',serviceKey:'server-only',fetcher:fetcher as any});
 const r=await gateway(new Request('https://edge.invalid',{method:'POST',headers:{Authorization:'Bearer real-session',Origin:'https://shivr-dev.github.io'},body:JSON.stringify({action:'list',actor:'attacker',body:{owner:'attacker'}})}));
 assert.equal(r.status,200);assert.equal(rpc.actor,'verified-owner');assert.equal(JSON.stringify(await r.json()).includes('server-only'),false);
});
test('pair creation stores only hashes, requires a valid challenge and never authorizes a device automatically',async()=>{
 let rpc:any,calls=0;
 const gateway=createWatchGateway({url:'https://test.invalid',serviceKey:'secret-server',fetcher:(async(_url:any,init:any)=>{calls++;rpc=JSON.parse(init.body);return Response.json({expiresAt:'later',interval:5});}) as any});
 const device='a'.repeat(64),challenge='b'.repeat(64);
 const make=(body:any)=>new Request('https://edge.invalid',{method:'POST',body:JSON.stringify({action:'begin',body})});
 const r=await gateway(make({device,challenge,name:'OWW231',platform:'Android 11'}));const result:any=await r.json();
 assert.equal(r.status,200);assert.equal(result.userCode.length,8);assert.equal(rpc.body.deviceHash,await deviceHash(device));assert.equal(rpc.actor,null);
 assert.equal(rpc.body.device,undefined);assert.equal(rpc.body.owner,undefined);assert.equal(rpc.body.codeHash,await deviceHash(result.userCode));
 assert.equal((await gateway(make({device:'weak',challenge,name:'x',platform:'x'}))).status,400);assert.equal(calls,1);
});
test('gateway rejects cross-origin requests, missing device credentials, and revoked credentials',async()=>{
 let calls=0;const gateway=createWatchGateway({url:'https://test.invalid',serviceKey:'server',fetcher:(async()=>{calls++;return Response.json({message:'Device authorization revoked or expired'},{status:400});}) as any});
 const make=(headers:any)=>new Request('https://edge.invalid',{method:'POST',headers,body:JSON.stringify({action:'status'})});
 assert.equal((await gateway(make({Origin:'https://evil.invalid'}))).status,403);
 assert.equal((await gateway(make({}))).status,400);
 assert.equal((await gateway(make({Authorization:'Device '+'d'.repeat(64)}))).status,401);assert.equal(calls,1);
});
test('download-only entry recognizes OWW231 without replacing desktop or ordinary phone pages',()=>{
 const desktop={userAgent:'Mozilla/5.0 Windows NT 10.0',screenWidth:1920,screenHeight:1080,coarsePointer:false};
 assert.equal(isWatchBrowser(desktop),false);
 assert.equal(isWatchBrowser({...desktop,userAgent:'Mozilla/5.0 Linux; Android 11; OWW231 Build/RKQ1',screenWidth:233,screenHeight:233,coarsePointer:true}),true);
 assert.equal(isWatchBrowser({...desktop,userAgent:'Mozilla/5.0 Android 14 Pixel 8',screenWidth:412,screenHeight:915,coarsePointer:true}),false);
 assert.equal(isWatchBrowser({...desktop,userAgent:'Mozilla/5.0 Android 11',screenWidth:233,screenHeight:233,coarsePointer:true}),true);
 assert.equal(validWatchRelease({version:'alpha',status:'testing',url:''}),false);
 assert.equal(validWatchRelease({version:'alpha',status:'ready',url:'https://evil.invalid/app.apk',sha256:'a'.repeat(64),bytes:2000,minimumAndroid:11}),false);
});
test('native practice persists a real session, validates its device and cannot complete unanswered tasks',()=>{
 const d=fixture(), device='12345678-1234-1234-1234-123456789abc';
 const s=startWatchSession(d,{sessionId:'watch-session:'+device+':one',subject:'math',limit:2},device,now);
 d.jobs=[s];assert.equal(s.mode,'review');assert.equal(s.items.length,2);
 assert.throws(()=>finishWatchSession(d,s.id,device,now),/未提交/);
 assert.throws(()=>answerWatchSession(d,{...input(d),sessionId:s.id,questionId:s.items[0].question.id},'another-device',now),/其他设备/);
 d.events=s.items.map((i,n)=>answerWatchSession(d,{...input(d),sessionId:s.id,questionId:i.question.id,eventId:'watch-event:'+device+':'+s.id+':'+n},device,now));
 const done=finishWatchSession(d,s.id,device,now);assert.equal(done.status,'complete');assert.equal(done.eventIds?.length,2);
 assert.equal(sessionForView([s],null,false),null);
});
test('a recommended native test uses the Director task, hides answers, becomes first resume and produces the shared test report',()=>{
 const d=fixture(),device='12345678-1234-1234-1234-123456789abc';
 const action=studyAgenda(d,now).actions.find(a=>a.kind==='initial')!;assert.ok(action);
 const s=startWatchSession(d,{sessionId:'watch-session:'+device+':test',actionId:action.id},device,now);d.jobs=[s];
 assert.equal(s.mode,'test');assert.deepEqual(s.items.map(i=>i.question.id),action.items?.map(i=>i.question.id));
 const a={...input(d),sessionId:s.id,questionId:s.items[0].question.id,eventId:'watch-event:'+device+':'+s.id+':0'};
 assert.throws(()=>answerWatchSession(d,a,device,now),/参考答案/);
 const agenda=studyAgenda(d,now);assert.equal(agenda.primary.id,'resume:'+s.id);assert.equal(agenda.primary.page,'devices');
 assert.throws(()=>startWatchSession(d,{sessionId:'watch-session:'+device+':second'},device,now),/未完成测评/);
 d.events=s.items.map((i,n)=>answerWatchSession(d,{...a,questionId:i.question.id,eventId:'watch-event:'+device+':'+s.id+':'+n,revealedAt:a.occurredAt},device,now));
 d.jobs=[finishWatchSession(d,s.id,device,now)];const projected=projectRecords(records(d));
 assert.equal(projected.tests.length,1);assert.equal(projected.tests[0].eventIds.length,s.items.length);assert.ok(projected.events.every(e=>e.source==='test'));
});
test('subject packages retain strong prerequisite closure and verified content without private learning records',()=>{
 const d=fixture();d.nodes[1].prerequisites=[d.nodes[0].id];d.nodes[0].prerequisites=[d.nodes[1].id];
 d.events=[watchAnswerEvent(d,input(d),now)];d.exams=[schoolExam(d,now,-3)];
 d.settings.name='private-learner';d.questions[0].reviewStatus='paused';d.questions[1].verified=false;
 const p=buildWatchPackage(d,'math',[d.nodes[1].id],now);
 assert.deepEqual(new Set(p.knowledge.map(n=>n.id)),new Set([d.nodes[0].id,d.nodes[1].id]));
 assert.ok(p.questions.every(q=>q.verified&&q.reviewStatus!=='paused'));
 const source=JSON.stringify(p);assert.equal(source.includes('private-learner'),false);assert.equal(source.includes(d.events[0].id),false);assert.equal(source.includes(d.exams[0].id),false);
 assert.ok(watchPackageRecords(p,new Date(now).toISOString()).every(r=>r.kind==='node'||r.kind==='question'));
 assert.throws(()=>buildWatchPackage(d,'math',['foreign-node'],now),/范围/);
});
test('offline task upload binds the original question identities instead of substituting the newly ranked queue',()=>{
 const d=fixture(),device='12345678-1234-1234-1234-123456789abc',id='watch-session:'+device+':offline';
 const chosen=[d.questions[6].id,d.questions[5].id];
 const session=startWatchSession(d,{sessionId:id,subject:'math',questionIds:chosen,startedAt:new Date(now-86400000).toISOString()},device,now);
 assert.deepEqual(session.items.map(i=>i.question.id),chosen);
 assert.equal(session.createdAt,new Date(now-86400000).toISOString());
 assert.throws(()=>startWatchSession(d,{sessionId:id,questionIds:['invented']},device,now),/暂停|过期|核验/);
});
import {installedWatchPackage,watchDownloadRequest,watchPackageCatalog} from '../lib/watch-package';
import {watchLearningCommand,watchCoursePages} from '../lib/watch-learning';
import {courseQuestions,courseNode,type Course} from '../lib/course-model';
import {watchCompletionRecords} from '../lib/watch-session';
import {preparePublicPack} from '../lib/public-pack';

test('package identity never substitutes other content from the same subject',()=>{
 const d=fixture();const ids=d.questions.slice(0,2).map(q=>q.id),node=d.nodes[0];
 const manifest={id:'my-real-pack',title:'真实学习包',subject:'math',description:'',version:'1',compatibility:'Reviewbox',changelog:'',nodeIds:d.nodes.map(n=>n.id),questionIds:ids};
 d.packs=[manifest];const pack=installedWatchPackage(d,manifest.id);
 assert.deepEqual(pack.questions.map(q=>q.id),ids);assert.equal(watchDownloadRequest(pack).packId,manifest.id);
 d.packs=[{...manifest,nodeIds:undefined,questionIds:undefined}];assert.throws(()=>installedWatchPackage(d,manifest.id),/重新导入/);
 const publicPack=preparePublicPack({...pack,events:[{secret:'private'}],settings:{name:'private'},questions:pack.questions.map(q=>({...q,verified:true}))});
 assert.equal((publicPack as any).events,undefined);assert.ok(publicPack.questions.every(q=>!q.verified));
});

test('watch offline catalogue includes all personal packs without a web download request or local questions',()=>{
 const d=fixture();
 d.packs=[{id:'offline-math',title:'我的数学包',subject:'math',version:'2',description:'',compatibility:'Reviewbox',changelog:'',nodeIds:['node-on-web'],questionIds:['q-on-web-1','q-on-web-2']},
 {id:'legacy-pack',title:'旧学习包',subject:'math',version:'1',description:'',compatibility:'Reviewbox',changelog:''}];
 d.questions=[];d.jobs=[];
 const catalog=watchPackageCatalog(d);
 assert.equal(catalog.length,2);assert.equal(catalog[0].downloadable,true);assert.equal(catalog[0].questionCount,2);
 assert.equal(catalog[1].downloadable,false);assert.match(catalog[1].unavailableReason,/重新导入/);
 const snapshot=watchCore({op:'snapshot',records:[...records(d),...d.packs.map(payload=>({id:payload.id,kind:'pack' as const,payload,deleted:false,updated_at:new Date(now).toISOString()}))],now}) as any;
 assert.deepEqual(snapshot.packages,catalog);assert.deepEqual(snapshot.downloads,[]);
});

test('all manual self-check types including pinyin blanks expose manual presentation',()=>{
 const d=fixture();for(const q of [{...d.questions[0],type:'pinyin'},{...d.questions[0],type:'subjective'},{...d.questions[0],type:'blank',prompt:'看拼音写汉字：shǒu qū yī zhǐ'}]) {
  assert.equal((watchCore({op:'presentation',records:[],input:q}) as any).manualCheck,true);
  assert.throws(()=>watchAnswerEvent({...d,questions:[q]},input(d),now),/手动检查/);
 }
});

function nativeCourse():Course {
 return {id:'course:watch-fixture',kind:'course',schemaVersion:1,subject:'math',title:'Watch Course',source:'source',sourceNames:[],fingerprint:'fixture',createdAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString(),current:0,status:'ready',chat:[],sections:[{
 id:'watch-section',source:'source',title:'Section',revision:1,history:[],passed:[],verification:{method:'verified',solverCount:3,at:new Date(now).toISOString()},
 content:{format:'free-html',title:'Section',html:'<p>Read this example.</p>',objectives:[],concepts:[],comparison:{title:'',columns:[],rows:[]},process:{title:'',steps:[]},recall:[],sourceQuotes:[],uncertainties:[],
 checks:[{prompt:'Choose A',options:['A','B','C','D'],answer:'A',explanation:'A is valid',skill:'understand'}],practice:[{prompt:'Explain this example',answer:'Independent explanation',explanation:'Check all steps',skill:'understand'}]}}]};
}
test('native course retries preserve separate evidence, gate completion and schedule delayed verification',()=>{
 const d=fixture(),course=nativeCourse(),section=course.sections[0];d.nodes.push(courseNode(course,section));d.questions.push(...courseQuestions(course,section,'checks'),...courseQuestions(course,section,'practice'));d.jobs=[course];
 const command={id:'attempt-1',kind:'course-check',courseId:course.id,sectionId:section.id,revision:1,questionId:courseQuestions(course,section,'checks')[0].id,answer:'B',timing:input(d)};
 let added=watchLearningCommand(d,command,'device',now);d.events.push(added[0].payload);d.jobs=[added[1].payload];
 assert.throws(()=>watchLearningCommand(d,{...command,kind:'course-section'},'device',now),/理解检验/);
 added=watchLearningCommand(d,{...command,id:'attempt-2',answer:'A'},'device',now);d.events.push(added[0].payload);d.jobs=[added[1].payload];
 assert.equal(d.events.length,2);assert.notEqual(d.events[0].id,d.events[1].id);assert.equal(d.events[1].attemptNumber,2);assert.equal(d.events[1].hintLevel,'answer');
 added=watchLearningCommand(d,{...command,id:'complete-section',kind:'course-section'},'device',now);d.jobs=added.map(r=>r.payload);
 assert.ok(d.jobs.find(j=>j.kind==='course-completion'));const session=startWatchSession(d,{sessionId:'watch-session:device:course',courseId:course.id},'device',now);d.jobs.push(session);
 d.events.push(...session.items.map((i,n)=>answerWatchSession(d,{...input(d),questionId:i.question.id,sessionId:session.id,eventId:'watch-event:device:'+session.id+':'+n,selfOutcome:'correct'},'device',now)));
 const done=finishWatchSession(d,session.id,'device',now),completion=watchCompletionRecords(d,done)[0].payload;
 assert.equal(completion.stage,'verify');assert.ok(completion.verification.length>=1);assert.ok(completion.verification.every((v:any)=>Date.parse(v.dueAt)>now));
 assert.deepEqual(watchCoursePages({concepts:[{title:'Concept',explanation:'Full explanation'}]}),['Concept','Full explanation']);
});

test('preference and note writes merge only allowed fields and reject stale edits',()=>{
 const d=fixture();const c={kind:'preferences',mode:'manual',minutes:30,previousMode:'guided',previousMinutes:d.settings.dailyMinutes,mastery:1};
 const out=watchLearningCommand(d,c,'device',now)[0];assert.equal(out.kind,'setting');assert.equal(out.payload.studyMode,'manual');assert.equal(out.payload.mastery,undefined);
 assert.throws(()=>watchLearningCommand(d,{...c,previousMinutes:999},'device',now),/其他设备/);
 d.notes=[{id:'note',nodeId:d.nodes[0].id,body:'Old'}];assert.throws(()=>watchLearningCommand(d,{id:'edit',kind:'note',noteId:'note',nodeId:d.nodes[0].id,text:'New',previousBody:'stale'},'device',now),/其他设备/);
});

test('gateway downloads only the requested personal package with device-derived ownership and a checked digest',async()=>{
 const d=fixture();const q=d.questions[0],n=d.nodes.find(n=>n.id===q.nodeId)!;
 d.packs=[{id:'exact-package',title:'我的学习包',subject:q.subject,version:'1',description:'',compatibility:'Reviewbox',changelog:'',nodeIds:[n.id],questionIds:[q.id]}];
 const rows=[...records(d),{id:d.packs[0].id,kind:'pack' as const,payload:d.packs[0],deleted:false,updated_at:new Date(now).toISOString()}];
 let ownershipQueries=0;
 const gateway=createWatchGateway({url:'https://test.invalid',serviceKey:'secret',fetcher:(async(url:any,init:any)=>{
  const u=new URL(url);
  if(u.pathname.endsWith('/review_device_api')){assert.equal(JSON.parse(init.body).action,'status');return Response.json({userId:'device-owner',deviceId:'device'});}
  assert.equal(u.searchParams.get('user_id'),'eq.device-owner');ownershipQueries++;return Response.json(rows);
 }) as any});
 const call=(packId:string)=>gateway(new Request('https://edge.invalid',{method:'POST',headers:{Authorization:'Device '+'a'.repeat(64)},body:JSON.stringify({action:'download-pack',body:{packId,owner:'attacker'}})}));
 const r=await call('exact-package');assert.equal(r.status,200);const result:any=await r.json();
 assert.equal(result.sha256,await deviceHash(result.packageJson));assert.equal(result.bytes,new TextEncoder().encode(result.packageJson).length);
 assert.deepEqual(JSON.parse(result.packageJson).questions.map((q:any)=>q.id),[q.id]);assert.equal(JSON.parse(result.packageJson).events,undefined);
 assert.equal((await call('not-my-package')).status,400);assert.equal(ownershipQueries,2);
});

test('gateway commits a course section and its practice continuation atomically with receipts and conflict preconditions',async()=>{
 const d=fixture(),course=nativeCourse();course.sections[0].passed=courseQuestions(course,course.sections[0],'checks').map(q=>q.id);d.jobs=[course];
 const rows=records(d);let pushed:any;
 const gateway=createWatchGateway({url:'https://test.invalid',serviceKey:'secret',fetcher:(async(url:any,init:any)=>{
  if(String(url).includes('/review_records?'))return Response.json(rows);
  const body=JSON.parse(init.body);if(body.action==='status')return Response.json({userId:'owner',deviceId:'device'});
  if(body.action==='receipts')return Response.json({});
  assert.equal(body.action,'push');pushed=body.body;return Response.json({changed:2});
 }) as any});
 const r=await gateway(new Request('https://edge.invalid',{method:'POST',headers:{Authorization:'Device '+'a'.repeat(64)},body:JSON.stringify({action:'push',body:{coreVersion:'review-watch-1',generation:'generation',commands:[{id:'complete-section',kind:'course-section',courseId:course.id,sectionId:course.sections[0].id,revision:1,mastery:1}]}})}));
 assert.equal(r.status,200);assert.deepEqual((await r.json() as any).acceptedIds,['complete-section']);assert.equal(pushed.records.length,2);
 assert.equal(pushed.records[0].commandId,'complete-section');assert.equal(pushed.records[1].commandId,'complete-section:0');
 assert.deepEqual(pushed.records[0].expectedPayload,course);assert.equal(pushed.records[1].expectedPayload,null);
 assert.equal(pushed.records[1].payload.kind,'course-completion');assert.equal(pushed.records[1].payload.stage,'practice');assert.equal(pushed.records[1].payload.mastery,undefined);
});


test('native public catalog requires a valid grant, and public download installs only through a device-owned RPC',async()=>{
 const d=fixture(),q=d.questions[0],n=d.nodes.find(n=>n.id===q.nodeId)!;
 const manifest={id:'community-test',title:'公共样例',subject:q.subject,version:'1',nodeIds:[n.id],questionIds:[q.id]};
 const rows=[...records(d),{id:'pack:'+manifest.id,kind:'pack',payload:manifest,updated_at:new Date(now).toISOString(),deleted:false}];
 let installed=false,listed=false;
 const gateway=createWatchGateway({url:'https://test.invalid',serviceKey:'server',fetcher:(async(url:any,init:any)=>{
   const u=new URL(url);
   if(u.pathname.endsWith('review_device_api')){const c=JSON.parse(init.body);assert.equal(c.actor,null);
     if(c.action==='status')return Response.json({userId:'owner',deviceId:'device'});
     assert.equal(c.action,'install-public-pack');assert.deepEqual(Object.keys(c.body).sort(),['accessHash','publicId']);installed=true;return Response.json({packId:manifest.id});}
   if(u.pathname.endsWith('review_public_packs')){assert.equal(u.searchParams.get('published'),'eq.true');assert.ok(!u.searchParams.get('select')?.includes('owner'));listed=true;return Response.json([{id:'12345678-1234-1234-1234-123456789abc',title:'公共样例',pack:{schemaVersion:1,manifest,knowledge:[n],questions:[q]}}]);}
   assert.equal(u.searchParams.get('user_id'),'eq.owner');return Response.json(rows);
 }) as any});
 const make=(action:string,body:any={},auth=true)=>new Request('https://edge.invalid',{method:'POST',headers:auth?{Authorization:'Device '+'a'.repeat(64)}:{},body:JSON.stringify({action,body})});
 assert.equal((await gateway(make('public-pack-list',{},false))).status,400);assert.equal(listed,false);
 assert.equal((await gateway(make('public-pack-list'))).status,200);assert.equal(listed,true);
 const r=await gateway(make('public-pack-download',{publicId:'12345678-1234-1234-1234-123456789abc',owner:'attacker',pack:{fake:true}}));
 assert.equal(r.status,200);assert.equal(installed,true);const result:any=await r.json();assert.equal(JSON.parse(result.packageJson).manifest.id,manifest.id);assert.equal(result.sha256,await deviceHash(result.packageJson));
});

test('gateway normalizes database expiry for older Android clients without changing its instant',async()=>{
 const gateway=createWatchGateway({url:'https://test.invalid',serviceKey:'server',fetcher:(async()=>Response.json({accessUntil:'2026-10-25T12:38:32.613642+00:00',refreshUntil:'2026-11-25T12:38:32.613642+00:00'})) as any});
 const r=await gateway(new Request('https://edge.invalid',{method:'POST',body:JSON.stringify({action:'refresh',body:{refresh:'a'.repeat(64),nextAccess:'b'.repeat(64),nextRefresh:'c'.repeat(64),requestId:'12345678-1234-1234-1234-123456789abc'}})}));
 assert.equal(r.status,200);assert.equal((await r.json() as any).accessUntil,'2026-10-25T12:38:32.613Z');
});
test('native public updates cannot silently return an old version or install a conflicting manifest',async()=>{
 const d=fixture(),q=d.questions[0],n=d.nodes.find(n=>n.id===q.nodeId)!;
 const manifest={id:'preflight-package',title:'版本测试',subject:q.subject,version:'1',nodeIds:[n.id],questionIds:[q.id]};
 let rows=[...records(d),{id:'pack:'+manifest.id,kind:'pack',payload:manifest,updated_at:new Date(now).toISOString(),deleted:false}],installed=false;
 const incoming={schemaVersion:1,manifest:{...manifest,version:'2'},knowledge:[n],questions:[{...q,prompt:'新版内容'}]};
 const gateway=createWatchGateway({url:'https://test.invalid',serviceKey:'server',fetcher:(async(url:any,init:any)=>{
  const u=new URL(url);if(u.pathname.endsWith('review_device_api')){const body=JSON.parse(init.body);if(body.action==='status')return Response.json({userId:'owner',deviceId:'device'});installed=true;throw new Error('Must not write');}
  if(u.pathname.endsWith('review_public_packs'))return Response.json([{pack:incoming}]);assert.equal(u.searchParams.get('user_id'),'eq.owner');return Response.json(rows);
 }) as any});
 const call=()=>gateway(new Request('https://edge.invalid',{method:'POST',headers:{Authorization:'Device '+'a'.repeat(64)},body:JSON.stringify({action:'public-pack-download',body:{publicId:'12345678-1234-1234-1234-123456789abc'}})}));
 const result=await call();assert.equal(result.status,400);assert.match((await result.json() as any).error,/版本差异/);assert.equal(installed,false);
 rows=rows.filter(r=>r.kind!=='pack');assert.equal((await call()).status,400);assert.equal(installed,false);
});


import {watchStudyPlan} from '../lib/watch-plan';
import {watchAgenda} from '../lib/watch-agenda';
test('watch test planning uses full account content and preserves the shared Director initial assessment',()=>{
 const d=fixture();const all=records(d);const web=studyAgenda(projectRecords(all),now);const plan=watchStudyPlan(all,undefined,now);
 assert.equal(web.primary.kind,'initial');assert.equal(plan.recommendation.id,web.primary.id);
 assert.ok(plan.actions.every(a=>!['practice','verify','simulation'].includes(a.kind)));
 assert.deepEqual(plan.capabilities,{practice:false,assessment:true});
 assert.deepEqual(studyAgenda(projectRecords(all),now).primary,web.primary);
 assert.equal((plan.recommendation as any).items,undefined);
 assert.deepEqual(plan.selected.questionIds,(watchAgenda(projectRecords(all),now).primary.items??[]).map(i=>i.question.id));
 assert.ok(plan.selected.questionIds.length>0,'Imported verified content must produce a real task');
 assert.deepEqual(plan.questionRecords.map(r=>r.id).sort(),[...new Set(plan.selected.questionIds)].sort());
 assert.ok(plan.questionRecords.every(r=>r.kind==='question'&&!r.deleted));
 assert.throws(()=>watchStudyPlan(all,'removed-task',now),/已更新/);
});

test('watch resume stages the original task even if the incremental cursor has already passed it',()=>{
 const d=fixture(),device='12345678-1234-1234-1234-123456789abc';
 const s=startWatchSession(d,{sessionId:'watch-session:'+device+':resume',subject:'math',limit:2},device,now);d.jobs=[s];
 const plan=watchStudyPlan(records(d),'resume:'+s.id,now,device);
 assert.equal(plan.selected.kind,'resume');assert.equal(plan.taskRecords.length,1);
 assert.deepEqual(plan.taskRecords[0].payload,s);
 assert.deepEqual(new Set(plan.questionRecords.map(r=>r.id)),new Set(s.items.map(i=>i.question.id)));
 const legacyRows=records(d).map(r=>r.id===s.id?{...r,id:'active-session'}:r);
 assert.deepEqual(watchStudyPlan(legacyRows,'resume:'+s.id,now,device).taskRecords[0].payload,s);
 const done={...s,status:'complete',eventIds:[],completedAt:new Date(now+1000).toISOString()};
 const mixed=[...legacyRows,{id:s.id,kind:'job' as const,payload:done,deleted:false,updated_at:new Date(now+1000).toISOString()}];
 assert.equal(projectRecords(mixed).jobs?.filter(j=>j.id===s.id).length,1);
 assert.equal(projectRecords(mixed).jobs?.find(j=>j.id===s.id)?.status,'complete');
 const other=watchStudyPlan(records(d),undefined,now,'another-device');
 assert.ok(other.actions.every(a=>a.target!==s.id));
});

test('native tests start, resume on their owning watch and protect against a second session',()=>{
 const d=fixture(),device='12345678-1234-1234-1234-123456789abc';
 const initial=studyAgenda(d,now).actions.find(a=>a.kind==='initial')!;
 const s=startWatchSession(d,{sessionId:'watch-session:'+device+':new',actionId:initial.id,assessmentOnly:true,startedAt:new Date(now).toISOString(),questionIds:initial.items!.map(i=>i.question.id),requestedMode:'test'},device,now);d.jobs=[s];
 assert.equal(s.mode,'test');
 const before=JSON.stringify(d),plan=watchStudyPlan(records(d),undefined,now,device);
 assert.equal(plan.recommendation.id,'resume:'+s.id);assert.equal(plan.taskRecords[0].payload.id,s.id);
 assert.throws(()=>startWatchSession(d,{sessionId:'watch-session:'+device+':second',assessmentOnly:true},device,now),/未完成测评/);
 const other=watchStudyPlan(records(d),undefined,now,'another-device');
 assert.equal(other.recommendation.kind,'rest');assert.doesNotMatch(other.recommendation.reason,/网页/);
 assert.equal(JSON.stringify(d),before);assert.equal(studyAgenda(d,now).primary.id,'resume:'+s.id);
});

test('a manually selected watch test remains an assessment rather than a reward-bearing review',()=>{
 const d=fixture(),device='12345678-1234-1234-1234-123456789abc';
 const s=startWatchSession(d,{sessionId:'watch-session:'+device+':manual-test',subject:'math',assessmentOnly:true,limit:2},device,now);
 assert.equal(s.mode,'test');assert.equal(s.items.length,2);
});
