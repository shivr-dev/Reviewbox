import { projectRecords } from './record-projection';
import { watchAnswerEvent, WATCH_CORE_VERSION } from './watch-core';
import { validResult, validExamDate } from './exam-outcomes';
import {startWatchSession,answerWatchSession,finishWatchSession} from './watch-session';
import {buildWatchPackage,installedWatchPackage,watchPackageRecords} from './watch-package';
import {preparePublicPack} from './public-pack';
import {watchStudyPlan} from './watch-plan';
import {watchLearningCommand} from './watch-learning';
import {watchCompletionRecords} from './watch-session';
import {courseNode,courseQuestions} from './course-model';
import type { LocalRecord } from './model';

type GatewayOptions = {url:string;serviceKey:string;fetcher?:typeof fetch};
const webActions=new Set(['inspect','approve','deny','list','revoke','notifications','cancel-pairing','pack-list','pack-get','pack-publish','pack-withdraw']);
const nativeActions=new Set(['begin','claim','refresh','status','pull','push','logout','download-pack','public-pack-list','public-pack-download','study-plan']);
const origins=new Set(['https://shivr-dev.github.io','https://review-study-kevin.shivrdream.chatgpt.site','http://localhost:3000','http://127.0.0.1:3000']);
const token=(v:unknown):string=>{if(typeof v!=='string'||!/^[a-f0-9]{64}$/.test(v))throw new Error('凭证格式无效');return v;};
export async function deviceHash(value:string) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(v=>v.toString(16).padStart(2,'0')).join('');
}
export function stableDeviceCommand(value:any):string {
  if(Array.isArray(value))return '['+value.map(stableDeviceCommand).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stableDeviceCommand(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
export function createWatchGateway(options:GatewayOptions) {
  const fetcher=options.fetcher ?? fetch;
  const rest=async(path:string,body?:unknown,auth?:string,method?:string):Promise<any>=>{
    const response=await fetcher(options.url+path,{method:method??(body?'POST':'GET'),headers:{apikey:options.serviceKey,Authorization:'Bearer '+(auth??options.serviceKey),'Content-Type':'application/json',Prefer:'return=representation,resolution=merge-duplicates'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
    const data:any=await response.json();
    if(!response.ok)throw new Error(data.message??data.error??'云端连接失败');
    return data;
  };
  const rpc=(action:string,body:unknown,actor:string|null=null)=>rest('/rest/v1/rpc/review_device_api',{action,body,actor});
  const ownedRecords=async(userId:string,contentOnly=false)=>{
    const rows:LocalRecord[]=[];
    for(let offset=0;;offset+=1000) {
      const page=await rest('/rest/v1/review_records?user_id=eq.'+encodeURIComponent(userId)+'&select=id,kind,payload,updated_at,deleted&order=id&limit=1000&offset='+offset+(contentOnly?'&kind=in.(node,question,pack,job)':''));
      rows.push(...page);if(page.length<1000)break;if(offset>=49000)throw new Error('资料较多，请分批同步');
    }
    return rows;
  };
  return async(request:Request):Promise<Response>=>{
    const origin=request.headers.get('origin');
    const headers={'Cache-Control':'no-store','Vary':'Origin',...(origin&&origins.has(origin)?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization, content-type'}:{})};
    const json=(value:unknown,status=200)=>Response.json(value,{status,headers});
    if(origin&&!origins.has(origin))return json({error:'请求来源不正确'},403);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(request.method!=='POST')return json({error:'不支持的请求'},405);
    try {
      const text=await request.text();if(new TextEncoder().encode(text).length>5000000)return json({error:'上传内容过大'},413);
      const {action,body={}}=JSON.parse(text);
      if(!webActions.has(action)&&!nativeActions.has(action))return json({error:'不支持的请求'},400);
      let actor:string|null=null;
      if(webActions.has(action)) {
        const auth=request.headers.get('authorization')??'';
        if(!auth.startsWith('Bearer '))return json({error:'请先登录 Reviewbox 账户'},401);
        const user=await rest('/auth/v1/user',undefined,auth.slice(7));
        if(!user.id || user.is_anonymous)return json({error:'需要正式账户授权'},401);
        actor=user.id;
      }
      let result:any;
      if(action==='pack-list') {
        const fields='id,title,description,version,question_count,updated_at';
        result={packs:await rest('/rest/v1/review_public_packs?published=eq.true&select='+fields+'&order=updated_at.desc&limit=100'),
          mine:await rest('/rest/v1/review_public_packs?owner=eq.'+actor+'&published=eq.true&select='+fields+'&order=updated_at.desc&limit=30')};
      } else if(action==='pack-get') {
        if(!/^[a-f0-9-]{36}$/.test(body.id??''))throw new Error('学习包标识无效');
        const rows=await rest('/rest/v1/review_public_packs?id=eq.'+body.id+'&published=eq.true&select=pack&limit=1');
        if(!rows.length)throw new Error('学习包已撤回或不存在');result={pack:rows[0].pack};
      } else if(action==='pack-publish') {
        const pack=preparePublicPack(body.pack);
        const sourceId=pack.manifest.id;
        const prefix='community-'+(await deviceHash(actor+':'+sourceId)).slice(0,20);
        const nodeIds=new Map(await Promise.all(pack.knowledge.map(async n=>[n.id,prefix+':n:'+(await deviceHash(n.id)).slice(0,20)] as const)));
        for(const n of pack.knowledge){const original=n.id;n.id=nodeIds.get(original)!;n.prerequisites=n.prerequisites.filter(id=>nodeIds.has(id)).map(id=>nodeIds.get(id)!);n.relatedNodes=n.relatedNodes.filter(id=>nodeIds.has(id)).map(id=>nodeIds.get(id)!);n.dependencies=n.dependencies?.filter(d=>nodeIds.has(d.nodeId)).map(d=>({...d,nodeId:nodeIds.get(d.nodeId)!}));}
        for(const q of pack.questions){q.nodeId=nodeIds.get(q.nodeId)!;q.id=prefix+':q:'+(await deviceHash(q.id)).slice(0,20);q.source='公共学习包 · '+pack.manifest.title;}
        pack.manifest.id=prefix;
        const existing=await rest('/rest/v1/review_public_packs?owner=eq.'+actor+'&published=eq.true&select=id,source_id&limit=31');
        if(existing.length>=30&&!existing.some((p:any)=>p.source_id===sourceId))throw new Error('每个账户最多发布 30 个学习包，请先撤回旧包');
        const rows=await rest('/rest/v1/review_public_packs?on_conflict=owner,source_id',{
          owner:actor,source_id:sourceId,title:pack.manifest.title,description:pack.manifest.description.slice(0,2000),
          version:pack.manifest.version.slice(0,80),question_count:pack.questions.length,pack,published:true,updated_at:new Date().toISOString()});
        result={id:rows[0].id};
      } else if(action==='pack-withdraw') {
        if(!/^[a-f0-9-]{36}$/.test(body.id??''))throw new Error('学习包标识无效');
        const rows=await rest('/rest/v1/review_public_packs?id=eq.'+body.id+'&owner=eq.'+actor,{published:false,updated_at:new Date().toISOString()},undefined,'PATCH');
        if(!rows.length)throw new Error('只能撤回自己发布的学习包');result={withdrawn:true};
      } else if(action==='begin') {
        const rawDevice=token(body.device),challenge=token(body.challenge);
        if(typeof body.name!=='string'||!body.name.trim()||body.name.length>80||typeof body.platform!=='string'||body.platform.length>120)throw new Error('设备名称无效');
        const bytes=crypto.getRandomValues(new Uint8Array(8)), alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        const code=[...bytes].map(x=>alphabet[x&31]).join('');
        result=await rpc(action,{deviceHash:await deviceHash(rawDevice),challenge,codeHash:await deviceHash(code),name:body.name.trim(),platform:body.platform,ipHash:await deviceHash(request.headers.get('x-forwarded-for')??request.headers.get('cf-connecting-ip')??'unknown')});
        result.userCode=code;result.verificationUri='https://shivr-dev.github.io/Reviewbox/#devices';
      } else if(['inspect','approve','deny'].includes(action)) {
        const code=String(body.code??'').toUpperCase().replace(/[ -]/g,'');
        if(!/^[A-HJ-NP-Z2-9]{8}$/.test(code))throw new Error('请输入手表上的八位配对码');
        result=await rpc(action,{codeHash:await deviceHash(code)},actor);
      } else if(action==='claim') {
        result=await rpc(action,{deviceHash:await deviceHash(token(body.device)),proofHash:await deviceHash(token(body.verifier)),accessHash:await deviceHash(token(body.access)),refreshHash:await deviceHash(token(body.refresh))});
      } else if(action==='refresh') {
        if(!/^[\da-f-]{36}$/.test(body.requestId??''))throw new Error('刷新请求标识无效');
        result=await rpc(action,{refreshHash:await deviceHash(token(body.refresh)),nextAccessHash:await deviceHash(token(body.nextAccess)),nextRefreshHash:await deviceHash(token(body.nextRefresh)),requestId:body.requestId});
      } else if(webActions.has(action)) {
        result=await rpc(action,{deviceId:body.deviceId,enabled:body.enabled===true},actor);
      } else {
        const raw=(request.headers.get('authorization')??'').replace(/^Device /,'');
        const accessHash=await deviceHash(token(raw));
        if(action==='study-plan') {
          const status=await rpc('status',{accessHash});
          if(body.actionId!==undefined&&(typeof body.actionId!=='string'||body.actionId.length>200))throw new Error('任务标识无效');
          result=watchStudyPlan(await ownedRecords(status.userId),body.actionId,Date.now(),status.deviceId);
        } else if(action==='public-pack-list') {
          await rpc('status',{accessHash});
          result={packs:await rest('/rest/v1/review_public_packs?published=eq.true&select=id,title,description,version,question_count,updated_at&order=updated_at.desc&limit=100')};
        } else if(action==='download-pack'||action==='public-pack-download') {
          const status=await rpc('status',{accessHash});
          if(action==='public-pack-download') {
            if(!/^[a-f0-9-]{36}$/.test(body.publicId??''))throw new Error('学习包标识无效');
            // The database reads the published content itself, derives the account from the
            // device grant and preserves previously reviewed private copies on repeat download.
            const installed=await rpc('install-public-pack',{accessHash,publicId:body.publicId});
            body.packId=installed.packId;
            delete body.courseId;
          }
          const rows=await ownedRecords(status.userId,true),data=projectRecords(rows);
          const course=body.courseId?data.jobs?.find(j=>j.id===body.courseId&&j.kind==='course'):undefined;
          if(body.courseId&&!course)throw new Error('课程不存在');
          const pack=course?{schemaVersion:1 as const,manifest:{id:'course:'+course.id,title:course.title,subject:course.subject,version:course.updatedAt,description:'课程讲解与已核验巩固题',changelog:'课程离线副本',compatibility:'Reviewbox Watch'},knowledge:course.sections.filter((s:any)=>s.content).map((s:any)=>courseNode(course,s)),questions:course.sections.flatMap((s:any)=>[...courseQuestions(course,s,'checks'),...courseQuestions(course,s,'practice')]).filter((q:any)=>q.verified)}:body.packId?installedWatchPackage(data,body.packId):buildWatchPackage(data,body.subject,body.scope??[]),packageJson=JSON.stringify(pack);
          const bytes=new TextEncoder().encode(packageJson).byteLength;
          if(bytes>10000000)throw new Error('学习包超过 10 MB，请在网页缩小知识点范围');
          result={packageJson,bytes,sha256:await deviceHash(packageJson),records:watchPackageRecords(pack,new Date().toISOString())};
        } else if(action==='push') {
          const status=await rpc('status',{accessHash});
          if(body.coreVersion!==WATCH_CORE_VERSION)throw new Error('学习核心版本已更新，请更新手表应用');
          if(!Array.isArray(body.commands)||body.commands.length>20)throw new Error('同步批次无效');
          const ids=body.commands.map((c:any)=>c.id);
          if(ids.some((id:unknown)=>typeof id!=='string'||!/^[\w:-]{1,130}$/.test(id))||new Set(ids).size!==ids.length)throw new Error('同步操作标识无效');
          const hashes=await Promise.all(body.commands.map((c:any)=>deviceHash(stableDeviceCommand(c))));
          const receipts=await rpc('receipts',{accessHash,ids});
          const pending=body.commands.filter((c:any,i:number)=>{
            if(receipts[c.id]&&receipts[c.id]!==hashes[i])throw new Error('相同操作标识不能用于不同修改');
            return !receipts[c.id];
          });
          if(!pending.length)return json({changed:0,acceptedIds:ids,coreVersion:WATCH_CORE_VERSION});
          // Owner comes only from the validated device grant, never from request data.
          const rows=await ownedRecords(status.userId);
          let data=projectRecords(rows);const byId=new Map(rows.map(r=>[r.id,r])),records:any[]=[];
          for(const c of pending) {
            let kind:LocalRecord['kind'],payload:any,id:string;
            let extra:LocalRecord[]=[];
            if(c.kind==='answer') {
              if(!String(c.input.eventId).startsWith('watch-event:'+status.deviceId+':'))throw new Error('作答设备标识无效');
              kind='event';payload=answerWatchSession(data,c.input,status.deviceId);id=payload.id;
            } else if(c.kind==='session-start') {
              kind='job';payload=startWatchSession(data,c.input,status.deviceId);id=payload.id;
            } else if(c.kind==='session-complete') {
              kind='job';payload=finishWatchSession(data,c.sessionId,status.deviceId);id=payload.id;extra=watchCompletionRecords(data,payload);
            } else if(c.kind==='grade') {
              const old=byId.get(c.examId);
              if(!old||old.kind!=='exam'||old.deleted||!validResult(c.result)||!validExamDate(old.payload.date))throw new Error('考试或成绩无效');
              const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
              if(old.payload.date>today)throw new Error('考试尚未结束，不能录入实际成绩');
              if(c.baseUpdatedAt!==old.updated_at)throw new Error('考试已在其他设备修改，请同步后重新录入');
              kind='exam';id=old.id;payload={...old.payload,result:{...c.result,recordedAt:new Date().toISOString()}};
            } else if(['note','preferences','course-check','course-section'].includes(c.kind)) {
              const generated=watchLearningCommand(data,c,status.deviceId);const first=generated.shift()!;
              kind=first.kind;id=first.id;payload=first.payload;extra=generated;
            } else throw new Error('该修改不允许由手表提交');
            const record={id,kind,payload,updated_at:new Date().toISOString(),deleted:false,expectedPayload:byId.get(id)?.payload??null,baseUpdatedAt:c.baseUpdatedAt??null,commandId:c.id,commandHash:await deviceHash(stableDeviceCommand(c))};
            records.push(record);byId.set(id,record);
            for(const [i,r] of extra.entries()) {const next={...r,expectedPayload:byId.get(r.id)?.payload??null,commandId:c.id+':'+i,commandHash:record.commandHash};records.push(next);byId.set(r.id,next);}
            data=projectRecords([...byId.values()]);
          }
          if(records.length>60)throw new Error('同步修改过多，请缩小批次');
          result=await rpc('push',{accessHash,generation:body.generation,records});
          result.acceptedIds=ids;
        } else result=await rpc(action,{accessHash,generation:body.generation,cursorTime:body.cursorTime,cursorId:body.cursorId,subjects:body.subjects,...(Array.isArray(body.questionIds)?{questionIds:body.questionIds}:{})});
      }
      // Old Android clients also receive a conventional millisecond UTC expiry.
      if(result?.accessUntil)result.accessUntil=new Date(result.accessUntil).toISOString();
      if(result?.refreshUntil)result.refreshUntil=new Date(result.refreshUntil).toISOString();
      return json({...result,coreVersion:WATCH_CORE_VERSION});
    } catch(error) {
      const message=error instanceof Error?error.message:'连接失败，请重试';
      const unauthorized=/authorization revoked|expired|Authentication required|JWT/i.test(message);
      return json({error:message},unauthorized?401:/rate limit|Poll too fast/.test(message)?429:/reset|其他设备|already/.test(message)?409:400);
    }
  };
}
