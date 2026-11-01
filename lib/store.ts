import {previewPack,planPack,stable,content,packHash,packVersions,type PackPreview,type PackChoices} from './pack-versions';
import { apiFetch } from './runtime';
import { openDB, type IDBPDatabase } from 'idb';

import { projectRecords } from './record-projection';
import { courseCompletionRecords } from './course-lifecycle';
import {previewPackRemoval,removalRecords,type PackRemovalPreview} from './pack-removal';
import {
  type LocalRecord,
  type StudyData,
  type RecordKind,
  type Pack,
} from './model';
let dbPromise: Promise<IDBPDatabase> | undefined;
let namespace = 'local';
const clearing = new Set<string>();
export const currentNamespace = () => namespace;
export function assertWritable(ns = namespace) {
  if (clearing.has(ns)) throw new Error('学习数据正在清理，请等待页面刷新');
}
export function database() {
  return (dbPromise ??= openDB('review-learning-v1', 1, {
    upgrade(db) {
      db.createObjectStore('records', { keyPath: 'key' });
      db.createObjectStore('queue', { keyPath: 'key' });
      db.createObjectStore('meta');
    },
  }));
}
const key = (id: string) => `${namespace}/${id}`;
export async function saveRecords(
  records: LocalRecord[],
  sync = true,
  ns = namespace,
) {
  if (clearing.has(ns)) throw new Error('学习数据正在清理，请等待页面刷新');
  const db = await database();
  const tx = db.transaction(['records', 'queue'], 'readwrite');
  for (const r of records) {
    const item = { ...r, key: ns + '/' + r.id, namespace: ns };
    const previous = await tx.objectStore('records').get(item.key);
    if (previous?.kind === 'event') continue;
    if (
      previous &&
      previous.kind === item.kind &&
      previous.deleted === item.deleted &&
      JSON.stringify(previous.payload) === JSON.stringify(item.payload)
    )
      continue;
    await tx.objectStore('records').put(item);
    if (sync) await tx.objectStore('queue').put(item);
  }
  await tx.done;
}
export async function put(
  kind: RecordKind,
  payload: any,
  id = payload.id ?? kind,
  deleted = false,
  ns = namespace,
) {
  const r: LocalRecord = {
    id,
    kind,
    payload,
    updated_at: new Date().toISOString(),
    deleted,
  };
  await saveRecords([r], true, ns);
  return r;
}
export async function allRecords(ns = namespace) {
  const db = await database();
  return (await db.getAll('records')).filter(
    (x) => x.namespace === ns,
  ) as LocalRecord[];
}
export async function completeActiveSession(sessionId: string, ns = namespace) {
  const db = await database();
  const tx = db.transaction(['records', 'queue'], 'readwrite');
  const key = ns + '/active-session';
  const current = await tx.objectStore('records').get(key);
  if (current?.payload?.id === sessionId) {
    const records = (await tx.objectStore('records').getAll()).filter(
      (r) => r.namespace === ns && !r.deleted,
    );
    const jobs = records.filter((r) => r.kind === 'job').map((r) => r.payload);
    for (const r of courseCompletionRecords(
      jobs,
      sessionId,
      new Date().toISOString(),
      {
        events: records.filter((r) => r.kind === 'event').map((r) => r.payload),
        nodes: records.filter((r) => r.kind === 'node').map((r) => r.payload),
        questions: records
          .filter((r) => r.kind === 'question')
          .map((r) => r.payload),
      },
    )) {
      const record = { ...r, key: ns + '/' + r.id, namespace: ns };
      await tx.objectStore('records').put(record);
      await tx.objectStore('queue').put(record);
    }
    const next = {
      ...current,
      payload: { ...current.payload, status: 'complete' },
      updated_at: new Date().toISOString(),
    };
    await tx.objectStore('records').put(next);
    await tx.objectStore('queue').put(next);
    if (current.payload.recommendationId) {
      const id =
        'study-outcome:' +
        current.payload.recommendationId +
        ':' +
        current.payload.recommendationActionId +
        ':completed';
      const r = {
        id,
        key: ns + '/' + id,
        namespace: ns,
        kind: 'job',
        payload: {
          id,
          kind: 'study-recommendation-outcome',
          traceId: current.payload.recommendationId,
          actionId: current.payload.recommendationActionId,
          choice: 'completed',
          sessionId,
          at: next.updated_at,
        },
        updated_at: next.updated_at,
        deleted: false,
      };
      if (!(await tx.objectStore('records').get(r.key))) {
        await tx.objectStore('records').put(r);
        await tx.objectStore('queue').put(r);
      }
    }
    if (current.payload.mode !== 'test') {
      const at = next.updated_at,
        session = current.payload;
      const marker = {
        id: 'study-completion:' + sessionId,
        key: ns + '/study-completion:' + sessionId,
        namespace: ns,
        kind: 'job',
        payload: {
          id: 'study-completion:' + sessionId,
          kind: 'study-completion',
          sessionId,
          title: session.title ?? '练习',
          completedAt: at,
          questionIds: (session.items ?? []).map((i: any) => i.question.id),
        },
        updated_at: at,
        deleted: false,
      };
      if (!(await tx.objectStore('records').get(marker.key))) {
        await tx.objectStore('records').put(marker);
        await tx.objectStore('queue').put(marker);
      }
    }
  }
  await tx.done;
}
export async function loadData(ns = namespace): Promise<StudyData> {
  return projectRecords(await allRecords(ns));
}

export async function previewInstallPack(pack:Pack,ns=currentNamespace()) {
  const records=await allRecords(ns);return {...await previewPack(pack,records),records,namespace:ns};
}
export async function commitPackUpdate(preview:PackPreview&{records:LocalRecord[];namespace:string},choices:PackChoices={}) {
  const ns=preview.namespace;
  if(ns!==currentNamespace())throw new Error('账户已切换，请重新查看更新');
  assertWritable(ns);
  const {assertPackReady}=await import('./import-review');
  if(preview.status==='installed')return {added:0,modified:0,archived:0,retained:0,reverify:0};
  const draft=planPack(preview,preview.records,choices),merged=new Map(preview.records.filter(r=>!r.deleted).map(r=>[r.id,r]));
  for(const r of draft.writes){if(r.deleted)merged.delete(r.id);else merged.set(r.id,r);}
  const installed=draft.writes.find(r=>r.kind==='pack')!.payload;
  assertPackReady({...preview.pack,knowledge:installed.nodeIds.map((id:string)=>merged.get(id)!.payload),questions:installed.questionIds.map((id:string)=>merged.get(id)!.payload)});
  const effectiveHash=await packHash({knowledge:installed.nodeIds.map((id:string)=>content(merged.get(id)!.payload)),questions:installed.questionIds.map((id:string)=>content(merged.get(id)!.payload)),scoringPolicy:installed.scoringPolicy});
  const plan=planPack(preview,preview.records,choices,draft.writes[0].updated_at,draft.id,effectiveHash),db=await database();
  const tx=db.transaction(['records','queue'],'readwrite');
  try {
    const rows=await tx.objectStore('records').getAll();
    const changedQuestions=new Set(plan.writes.filter(r=>r.kind==='question').map(r=>r.id));
    if(rows.some(r=>r.namespace===ns&&!r.deleted&&r.kind==='job'&&['active','break'].includes(r.payload.status)&&(r.payload.items??[]).some((i:any)=>changedQuestions.has(i.question?.id??i.questionId))))throw new Error('这些题目正在未完成的学习或考试中使用，请先完成或退出该任务后再更新');
    const old=new Map(preview.records.map(r=>[r.id,r]));
    const guarded=new Set([...plan.writes.filter(r=>r.kind!=='job').map(r=>r.id),...preview.changes.map(c=>c.id)]);
    for(const id of guarded){const r={id};
      const current=rows.find(x=>x.key===ns+'/'+r.id),expected=old.get(r.id);
      if(stable(current?{kind:current.kind,payload:current.payload,deleted:current.deleted}:null)!==stable(expected?{kind:expected.kind,payload:expected.payload,deleted:expected.deleted}:null))throw new Error('内容刚刚发生变化，请重新查看更新；尚未写入任何修改');
    }
    if(ns!==currentNamespace())throw new Error('账户已切换');
    for(const r of plan.writes){const row={...r,key:ns+'/'+r.id,namespace:ns};await tx.objectStore('records').put(row);await tx.objectStore('queue').put(row);}
    await tx.done;return plan.counts;
  } catch(e){try{tx.abort();}catch{}await tx.done.catch(()=>{});throw e;}
}
export async function installPack(pack:Pack,ns=currentNamespace(),choices:PackChoices={}) {
  return commitPackUpdate(await previewInstallPack(pack,ns),choices);
}
export async function inspectPackRemoval(packId:string,ns=currentNamespace()){
 return {...await previewPackRemoval(packId,await allRecords(ns)),namespace:ns};
}
export async function removeInstalledPack(preview:PackRemovalPreview&{namespace:string}){
 const ns=preview.namespace;assertWritable(ns);if(ns!==currentNamespace())throw new Error('账户已切换，请重新确认');
 // Hash validation is completed before opening the IDB transaction. Awaiting
 // WebCrypto inside it would let the browser close the transaction prematurely.
 const snapshot=await allRecords(ns),current=await previewPackRemoval(preview.packId,snapshot);
 const db=await database(),tx=db.transaction(['records','queue'],'readwrite');
 try{const rows=(await tx.objectStore('records').getAll()).filter(r=>r.namespace===ns);
 if(stable(rows.map(r=>({id:r.id,payload:r.payload,deleted:r.deleted,updated_at:r.updated_at})))!==current.fingerprint)throw new Error('学习记录刚刚变化，请重新查看删除预览');
 if(current.fingerprint!==preview.fingerprint)throw new Error('学习记录刚刚变化，请重新查看删除预览');
 const plan=removalRecords(current,rows);for(const r of plan.writes){const row={...r,key:ns+'/'+r.id,namespace:ns};await tx.objectStore('records').put(row);await tx.objectStore('queue').put(row);}await tx.done;return plan.removalId;
 }catch(e){try{tx.abort();}catch{}await tx.done.catch(()=>{});throw e;}
}
export async function undoPackRemoval(removalId:string,ns=currentNamespace()){
 assertWritable(ns);if(ns!==currentNamespace())throw new Error('账户已切换');const db=await database(),tx=db.transaction(['records','queue'],'readwrite');
 try{const rows=(await tx.objectStore('records').getAll()).filter(r=>r.namespace===ns),job=rows.find(r=>r.id===removalId)?.payload;
 if(!job||job.status!=='removed'||Date.now()>Date.parse(job.undoUntil))throw new Error('撤销时限已过；历史记录仍保留，可以重新导入学习包');
 const before:LocalRecord[]=JSON.parse(job.partIds.map((id:string)=>{const part=rows.find(r=>r.id===id);if(part?.payload.operationId!==job.operationId)throw new Error('撤销记录尚未同步完整');return part.payload.text;}).join(''));
 const at=new Date().toISOString();for(const r of before){const present=rows.find(p=>p.id===r.id);if(present&&present.updated_at>job.removedAt)throw new Error('删除后内容又有修改，请重新导入以避免覆盖');const row={...r,payload:{...r.payload,_packRestore:{packId:job.packId,operationId:job.operationId},...(r.kind==='pack'?{restoredFromRemoval:job.operationId}:{})},updated_at:at,key:ns+'/'+r.id,namespace:ns};await tx.objectStore('records').put(row);await tx.objectStore('queue').put(row);}
 const row={id:removalId,kind:'job',payload:{...job,status:'restored'},updated_at:at,deleted:false,key:ns+'/'+removalId,namespace:ns};await tx.objectStore('records').put(row);await tx.objectStore('queue').put(row);await tx.done;
 }catch(e){try{tx.abort();}catch{}await tx.done.catch(()=>{});throw e;}
}
export async function undoPackUpdate(versionId:string,ns=currentNamespace()) {
  assertWritable(ns);const db=await database(),tx=db.transaction(['records','queue'],'readwrite');
  try {
    const rows=(await tx.objectStore('records').getAll()).filter(r=>r.namespace===ns);
    const version=packVersions(rows).find(r=>r.id===versionId)?.payload;
    if(version?.incomplete)throw new Error('版本历史尚未完整同步，请稍后重试');
    const affected=new Set((version?.after??[]).filter((r:LocalRecord)=>r.kind==='question').map((r:LocalRecord)=>r.id));
    if(rows.some(r=>!r.deleted&&r.kind==='job'&&['active','break'].includes(r.payload.status)&&(r.payload.items??[]).some((i:any)=>affected.has(i.question?.id??i.questionId))))throw new Error('题目正在未完成的任务中使用，请先完成任务后再回滚');
    if(!version||rows.find(r=>r.kind==='pack'&&!r.deleted&&r.payload.id===version.packId)?.payload.installationId!==versionId)throw new Error('只可直接撤销当前版本；更早版本请使用版本预览');
    for(const after of version.after){const current=rows.find(r=>r.id===after.id);if(!current||stable(current.payload)!==stable(after.payload)||current.deleted!==after.deleted)throw new Error('更新后内容已被修改，请通过版本预览回滚以保护你的修改');}
    if(ns!==currentNamespace())throw new Error('账户已切换');
    const at=new Date().toISOString();
    for(const after of version.after){const before=version.before.find((r:LocalRecord)=>r.id===after.id);if(after.kind==='node'&&!before)continue;const r={...(before??after),deleted:before?.deleted??true,updated_at:at,key:ns+'/'+after.id,namespace:ns};await tx.objectStore('records').put(r);await tx.objectStore('queue').put(r);}
    await tx.done;
  }catch(e){try{tx.abort();}catch{}await tx.done.catch(()=>{});throw e;}
}
export async function initialize() {
  // Production spaces start empty. Content is installed only by the learner.
  // The 2.0 migration archives only hash-matching originals. Edited content,
  // independent notes, shared nodes, scores and immutable attempts are protected.
  for(const packId of ['review-core','review-framework']){
    if((await allRecords()).some(r=>r.kind==='pack'&&!r.deleted&&r.payload.id===packId))await removeInstalledPack(await inspectPackRemoval(packId));
  }
  try {
    await navigator.storage?.persist?.();
  } catch {}
  return loadData();
}
export async function getMeta(id: string) {
  return (await database()).get('meta', id);
}
export async function setMeta(id: string, value: any) {
  return (await database()).put('meta', value, id);
}
export async function switchAccount(userId: string | null) {
  namespace = userId ?? 'local';
  await setMeta('activeAccount', namespace);
  return initialize();
}
export async function restoreNamespace() {
  namespace = (await getMeta('activeAccount')) ?? 'local';
  return initialize();
}
export async function pendingCount() {
  const rows = await (await database()).getAll('queue');
  return rows.filter((x) => x.namespace === namespace).length;
}
export async function uploadLocalToAccount(userId: string) {
  const records = await (await database()).getAll('records');
  const local = records.filter((r) => r.namespace === 'local');
  const existing = new Set(
    records.filter((r) => r.namespace === userId).map((r) => r.id),
  );
  await saveRecords(
    local.filter((r) => !existing.has(r.id)),
    true,
    userId,
  );
  if (await getMeta('personal-mode:local'))
    await setMeta('personal-mode:' + userId, true);
}
async function api(
  path: string,
  body?: any,
  expectedAccount?: string,
): Promise<any> {
  const r = await apiFetch('/api/' + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(expectedAccount ? { 'X-Review-Account': expectedAccount } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data: any = await r.json();
  if (!r.ok) throw new Error(data.error ?? '连接暂时不可用');
  return data;
}
let syncing: Promise<number> | undefined;
export function syncBatches<T extends LocalRecord>(records: T[]) {
  const result: T[][] = [];
  let batch: T[] = [],
    bytes = 20;
  for (const record of records) {
    const { id, kind, payload, updated_at, deleted } = record;
    const size =
      new TextEncoder().encode(
        JSON.stringify({ id, kind, payload, updated_at, deleted }),
      ).length + 1;
    if (size > 1900000)
      throw new Error(
        '单条资料超过云同步大小限制，请拆分资料后重试；本地内容仍已保存',
      );
    if (batch.length >= 60 || bytes + size > 3500000) {
      result.push(batch);
      batch = [];
      bytes = 20;
    }
    batch.push(record);
    bytes += size;
  }
  if (batch.length) result.push(batch);
  return result;
}
export function syncCloud() {
  return (syncing ??= performSync().finally(() => {
    syncing = undefined;
  }));
}
async function performSync() {
  if (namespace === 'local' || !navigator.onLine) return pendingCount();
  const accountAtStart = namespace;
  if (clearing.has(accountAtStart)) throw new Error('数据清理期间暂停同步');
  const verified = await api('account');
  if (verified.user?.id !== accountAtStart)
    throw new Error('账户已变化，请重新登录后再同步');
  const state = await api('sync?status=1', undefined, accountAtStart);
  if (typeof state.generation !== 'string')
    throw new Error('云端同步状态无效，请稍后重试');
  const known = await getMeta('generation:' + accountAtStart);
  if ((known && known !== state.generation) || (!known && state.resetAt)) {
    await eraseNamespaces([accountAtStart]);
    await setMeta('generation:' + accountAtStart, state.generation);
    if (typeof window !== 'undefined') {
      clearing.add(accountAtStart);
      window.location.reload();
    }
    return 0;
  }
  await setMeta('generation:' + accountAtStart, state.generation);
  const db = await database();
  const pending = (await db.getAll('queue')).filter(
    (x) => x.namespace === accountAtStart,
  );
  const batches = syncBatches(pending);
  for (const batch of batches) {
    if (namespace !== accountAtStart || clearing.has(accountAtStart))
      throw new Error('账户已变化或数据正在清理，同步已暂停');
    await api(
      'sync',
      {
        generation: state.generation,
        records: batch.map(({ id, kind, payload, updated_at, deleted }) => ({
          id,
          kind,
          payload,
          updated_at,
          deleted,
        })),
      },
      accountAtStart,
    );
    const tx = db.transaction('queue', 'readwrite');
    for (const r of batch) {
      const current = await tx.store.get(r.key);
      if (current?.updated_at === r.updated_at) await tx.store.delete(r.key);
    }
    await tx.done;
  }
  // Pull the complete ordered record set: immutable event IDs make retries idempotent.
  let cursor = '';
  do {
    if (namespace !== accountAtStart || clearing.has(accountAtStart))
      throw new Error('账户已变化或数据正在清理，同步已暂停');
    const result = await api(
      'sync?cursor=' + encodeURIComponent(cursor),
      undefined,
      accountAtStart,
    );
    if (result.generation && result.generation !== state.generation)
      throw new Error('学习数据已在其他设备清理，请重新同步');
    const tx = db.transaction(['records', 'queue'], 'readwrite');
    for (const r of result.records) {
      const recordKey = `${accountAtStart}/${r.id}`;
      const local = await tx.objectStore('records').get(recordKey);
      const queued = await tx.objectStore('queue').get(recordKey);
      if (!queued && (!local || r.updated_at > local.updated_at))
        await tx
          .objectStore('records')
          .put({ ...r, key: recordKey, namespace: accountAtStart });
    }
    await tx.done;
    cursor = result.cursor ?? '';
  } while (cursor);
  await setMeta('synced:' + accountAtStart, new Date().toISOString());
  return pendingCount();
}
export async function account() {
  return api('account');
}
export async function signIn(
  email: string,
  password: string,
  register = false,
) {
  return api('account', {
    action: register ? 'register' : 'login',
    email,
    password,
  });
}
export async function signOut() {
  await api('account', { action: 'logout' });
  await switchAccount(null);
}
export async function exportBackup() {
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    records: await allRecords(),
  };
}
export async function restoreBackup(value: any, ns=currentNamespace()) {
  if (
    value?.schemaVersion !== 1 ||
    !Array.isArray(value.records) ||
    value.records.length > 30000
  )
    throw new Error('备份格式不正确或版本不兼容');
  const allowed = [
    'node',
    'question',
    'event',
    'exam',
    'note',
    'material',
    'setting',
    'test',
    'pack',
    'job',
  ];
  const current = new Map((await allRecords(ns)).map((r) => [r.id, r]));
  if(ns!==currentNamespace())throw new Error('账户已切换，请重新选择备份');
  const rows: LocalRecord[] = [];
  for (const r of value.records) {
    if (
      !r ||
      typeof r.id !== 'string' ||
      !allowed.includes(r.kind) ||
      !r.payload ||
      !Number.isFinite(Date.parse(r.updated_at))
    )
      throw new Error('备份包含无效记录');
    const old = current.get(r.id);
    if (!old || (r.kind !== 'event' && r.updated_at > old.updated_at))
      rows.push({
        id: r.id,
        kind: r.kind,
        payload: r.payload,
        updated_at: r.updated_at,
        deleted: !!r.deleted,
      });
  }
  if(ns!==currentNamespace())throw new Error('账户已切换，请重新选择备份');
  await saveRecords(rows,true,ns);
  return rows.length;
}

async function eraseNamespaces(namespaces: string[]) {
  const db = await database(),
    selected = new Set(namespaces);
  const tx = db.transaction(['records', 'queue', 'meta'], 'readwrite');
  for (const name of ['records', 'queue'] as const) {
    let cursor = await tx.objectStore(name).openCursor();
    while (cursor) {
      if (selected.has(cursor.value.namespace)) await cursor.delete();
      cursor = await cursor.continue();
    }
  }
  let cursor = await tx.objectStore('meta').openCursor();
  while (cursor) {
    if (
      typeof cursor.key === 'string' &&
      namespaces.some((ns) => String(cursor!.key).endsWith(':' + ns))
    )
      await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}
export async function clearAllStudyData(
  expectedNamespace = currentNamespace(),
) {
  if (expectedNamespace !== namespace)
    throw new Error('账户已切换，请重新确认清理范围');
  const selected = [...new Set([expectedNamespace, 'local'])];
  for (const ns of selected) clearing.add(ns);
  try {
    await syncing?.catch(() => {});
    let generation: string | undefined;
    if (expectedNamespace !== 'local') {
      if (!navigator.onLine)
        throw new Error('清理云端数据需要联网；当前数据尚未清理');
      const state = await api('sync?status=1', undefined, expectedNamespace);
      if (typeof state.generation !== 'string')
        throw new Error('无法确认云端状态，尚未清理数据');
      const pending = (await getMeta('clear-request:' + expectedNamespace)) ?? {
        requestId: crypto.randomUUID(),
        generation: state.generation,
      };
      await setMeta('clear-request:' + expectedNamespace, pending);
      const result = await api(
        'reset',
        {
          confirmation: '清理所有数据',
          requestId: pending.requestId,
          generation: pending.generation,
        },
        expectedNamespace,
      );
      if (typeof result.generation !== 'string')
        throw new Error('未收到清理完成确认，请重试');
      generation = result.generation;
    }
    await eraseNamespaces(selected);
    if (generation)
      await setMeta('generation:' + expectedNamespace, generation);
    if (typeof window !== 'undefined')
      localStorage.setItem(
        'review-data-cleared',
        JSON.stringify({ namespaces: selected, at: Date.now() }),
      );
  } catch (e) {
    for (const ns of selected) clearing.delete(ns);
    throw e;
  }
}
if (typeof window !== 'undefined')
  window.addEventListener('storage', (event) => {
    if (event.key === 'review-data-cleared' && event.newValue) {
      try {
        const value = JSON.parse(event.newValue);
        if (value.namespaces?.includes(namespace)) {
          clearing.add(namespace);
          window.location.reload();
        }
      } catch {}
    }
  });
