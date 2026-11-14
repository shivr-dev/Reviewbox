import { checkInSettings, type CheckInDraft } from './learning-check-in';
import { validateExamDetails } from './exam-schedule';
import { projectRecords } from './record-projection';
import { assertWritable, currentNamespace, database } from './store';
import type { Exam, LocalRecord } from './model';
import { AGREEMENT_VERSION, hasAcceptedAgreement } from './product-agreement';

export async function saveLearningCheckIn(
  draft: CheckInDraft,
  options: { complete?: boolean; sharing?: boolean; skip?: boolean } = {},
  ns = currentNamespace(),
) {
  const check = () => {
    assertWritable(ns);
    if (ns !== currentNamespace()) throw new Error('account');
  };
  check();
  const db = await database();
  check();
  const tx = db.transaction(['records', 'queue'], 'readwrite');
  const records = tx.objectStore('records');
  const queue = tx.objectStore('queue');
  try {
    const rows = (await records.getAll()).filter(r => r.namespace === ns);
    check();
    const data = projectRecords(rows);
    const at = new Date().toISOString();
    const privacy = options.sharing === undefined ? {} : {
      termsAcceptance: hasAcceptedAgreement(data.settings.termsAcceptance)
        ? data.settings.termsAcceptance
        : {version: AGREEMENT_VERSION, acceptedAt: at},
      productDataCollection: {enabled: options.sharing, updatedAt: at},
    };
    const accepted = hasAcceptedAgreement(privacy.termsAcceptance ?? data.settings.termsAcceptance);
    if ((options.complete || draft.step === 'ready') && !accepted && !options.skip) throw new Error('agreement');
    const settings = options.complete ? checkInSettings(data, draft.profile, at, draft.weights) :
      {...data.settings, learningCheckIn: options.skip ? undefined : draft};
    async function write(row: LocalRecord) {
      const value = {...row, key: ns + '/' + row.id, namespace: ns};
      await records.put(value);
      await queue.put(value);
    }
    let exam: Exam | undefined;
    if (options.complete && draft.exam && draft.profile.goals.includes('exam')) {
      exam = data.exams.find(e => e.id === draft.examKey ||
        (e.subject === draft.exam!.subject && e.title === draft.exam!.title.trim() && e.date === draft.exam!.date));
      if (!exam) {
        const details = validateExamDetails({
          title: draft.exam.title,
          subject: draft.exam.subject,
          date: draft.exam.date,
          scope: draft.exam.scope,
          target: draft.exam.target,
          dailyMinutes: draft.profile.minutes,
        }, data.nodes);
        if (rows.some(r => r.id === draft.examKey)) throw new Error('exam');
        exam = {...details, id: draft.examKey, scoreReminderEnabled: draft.exam.scoreReminder};
        await write({kind:'exam', id: exam.id, payload: exam, deleted:false, updated_at:at});
      }
    }
    await write({kind:'setting', id:'settings', payload:{...settings,...privacy}, deleted:false, updated_at:at});
    check();
    await tx.done;
    return exam;
  } catch (error) {
    try { tx.abort(); } catch {}
    await tx.done.catch(() => {});
    throw error;
  }
}
