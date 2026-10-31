import { projectQuality } from './question-quality';
import type { LocalRecord, StudyData } from './model';

/** Shared web/native projection, including course hydration and quality exclusions. */
export function projectRecords(input: LocalRecord[]): StudyData {
  const records = input.filter((r) => !r.deleted);
  const get = (kind: string) =>
    records.filter((r) => r.kind === kind).map((r) => r.payload);
  // Legacy web sessions use an active-session storage alias. A later canonical
  // completion must supersede that alias instead of resurrecting its active state.
  const logicalJobs=new Map<string,LocalRecord>();
  for(const row of records.filter(r=>r.kind==='job')) {
    const id=row.payload.id??row.id,previous=logicalJobs.get(id);
    const stamp=(r:LocalRecord)=>Date.parse(r.updated_at)||0;
    if(!previous||stamp(row)>stamp(previous)||(stamp(row)===stamp(previous)&&row.id===id))logicalJobs.set(id,row);
  }
  const jobs = [...logicalJobs.values()].filter(r=>r.payload.kind!=='pack-version-part').map(r=>r.payload);
  const jobMap = new Map(jobs.map((j) => [j.id, j]));
  const hydrated = jobs.map((j) =>
    j.kind === 'course' && j.storageVersion === 1
      ? {
          ...j,
          sections: j.sections.map((s: any) => {
            const stored = jobMap.get('course-section:' + s.id);
            if (!stored || stored.courseId !== j.id)
              return { ...s, history: [] };
            const section = stored.section;
            return {
              ...section,
              history: (section.history ?? [])
                .map((h: any) => ({
                  ...h,
                  content: jobMap.get(h.contentId)?.content,
                }))
                .filter((h: any) => h.content),
            };
          }),
          chat: (j.chatIds ?? [])
            .map((id: string) => jobMap.get(id))
            .filter((x: any) => x?.courseId === j.id)
            .map((x: any) => x.message),
        }
      : j,
  );
  return projectQuality({
    jobs: [...hydrated,...hydrated.filter(j=>j.kind==='session'&&j.ownerDeviceId&&j.mode==='review'&&j.status==='complete'&&j.eventIds?.length).map(j=>({id:'study-completion:'+j.id,kind:'study-completion',sessionId:j.id,title:j.title,completedAt:j.completedAt,questionIds:(j.items??[]).map((i:any)=>i.question.id)}))],
    nodes: get('node'),
    questions: get('question'),
    events: get('event'),
    exams: get('exam'),
    notes: get('note'),
    materials: get('material'),
    tests: [...get('test'),...hydrated.filter(j=>j.kind==='session'&&j.ownerDeviceId&&j.mode==='test'&&j.status==='complete'&&j.eventIds?.length).map(j=>({id:'watch-test:'+j.id,title:j.title,subject:j.subject??'all',sessionId:j.id,eventIds:j.eventIds,at:j.completedAt,scope:[...new Set((j.items??[]).map((i:any)=>i.question.nodeId))]}))],
    packs: get('pack'),
    settings: {
      dailyMinutes: 20,
      name: '我的学习空间',
      surprise: true,
      ...get('setting').reduce((a, b) => ({ ...a, ...b }), {}),
    },
  });
}
