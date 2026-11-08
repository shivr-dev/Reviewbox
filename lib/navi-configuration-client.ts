import { assertWritable, currentNamespace, database } from './store';
import { validateGpaConfig, gpaConfig } from './exam-outcomes';
import { validateExamDetails } from './exam-schedule';
import { projectRecords } from './record-projection';
import {
  naviConfigurationAction,
  configurationBaseline,
  learningPreferences,
  type NaviConfigurationAction,
} from './navi-configuration';
import type { LocalRecord } from './model';
import {
  configurationChanges,
  configurationValue,
  equalConfigurationValue,
  restoreConfigurationValue,
  validatedConfigurationReceipt,
  type ConfigurationReceipt,
} from './navi-configuration-history';

/** One confirmed operation = one atomic write + receipt; retry/double tap cannot duplicate exams. */
export async function applyNaviConfiguration(
  input: unknown,
  operationId: string,
  baseline: string,
  ns: string,
) {
  const action = naviConfigurationAction.parse(input);
  if (!/^navi-config:[\w-]{1,100}$/.test(operationId)) throw Error('invalid');
  const check = () => {
    if (ns !== currentNamespace()) throw Error('account');
    assertWritable(ns);
  };
  check();
  const db = await database();
  check();
  const tx = db.transaction(['records', 'queue'], 'readwrite'),
    records = tx.objectStore('records');
  try {
    const receipt = await records.get(ns + '/' + operationId);
    if (receipt && !receipt.deleted) {
      if (receipt.payload.undoneAt) throw Error('changed');
      if (JSON.stringify(receipt.payload.action) !== JSON.stringify(action))
        throw Error('changed');
      await tx.done;
      return;
    }
    const all = (await records.getAll()).filter(
      (r: any) => r.namespace === ns && !r.deleted,
    );
    // Use the same projection as the application, including defaults and legacy
    // settings records, so confirmation compares the state the user actually saw.
    const data = projectRecords(all as LocalRecord[]);
    const settings = data.settings;
    if (configurationBaseline(data, action) !== baseline)
      throw Error('changed');
    let history: Partial<ConfigurationReceipt> = {};
    const write = async (
      kind: LocalRecord['kind'],
      id: string,
      payload: any,
    ) => {
      check();
      if (kind === 'setting' || kind === 'exam') {
        const before =
          kind === 'setting' ? settings : data.exams.find((e) => e.id === id);
        history = {
          recordKind: kind,
          recordId: id,
          changes: configurationChanges(action, before, payload),
        };
        if (action.type === 'createExam') {
          // Undo means cancel this newly scheduled exam, preserving any later score/history.
          history.changes = [
            {
              path: ['scheduleStatus'],
              before: { exists: true, value: 'cancelled' },
              after: configurationValue(payload, ['scheduleStatus']),
            },
          ];
          history.guards = [
            'title',
            'subject',
            'date',
            'target',
            'dailyMinutes',
            'scope',
            'scheduleStatus',
          ].map((k) => ({
            path: [k],
            after: configurationValue(payload, [k]),
          }));
        }
      }
      const row = {
        key: ns + '/' + id,
        id,
        kind,
        payload,
        namespace: ns,
        updated_at: new Date().toISOString(),
        deleted: false,
      };
      await records.put(row);
      await tx.objectStore('queue').put(row);
    };
    if (action.type === 'setGpaRule')
      await write('setting', 'settings', {
        ...settings,
        examGpa: validateGpaConfig({ ...gpaConfig(data), ...action.changes }),
      });
    else if (action.type === 'setDailyTime')
      await write('setting', 'settings', {
        ...settings,
        dailyMinutes: action.minutes,
        assistant: settings.assistant
          ? { ...settings.assistant, dailyMinutes: action.minutes }
          : undefined,
      });
    else if (action.type === 'setLearningPreferences') {
      const current = learningPreferences(data),
        weights = { ...current.weights, ...action.changes.weights };
      if (!Object.values(weights).some((w) => w > 0)) throw Error('invalid');
      await write('setting', 'settings', {
        ...settings,
        studyMode: action.changes.mode ?? current.mode,
        assistant: {
          ...settings.assistant,
          version: 1,
          weights,
          dailyMinutes:
            settings.assistant?.dailyMinutes ?? settings.dailyMinutes,
        },
      });
    } else if (action.type === 'setExamScheduled') {
      const exam = data.exams.find((e) => e.id === action.examId);
      if (!exam) throw Error('changed');
      await write('exam', exam.id, {
        ...exam,
        scheduleStatus: action.enabled ? 'active' : 'cancelled',
      });
    } else {
      const previous =
        action.type === 'updateExam'
          ? data.exams.find((e) => e.id === action.examId)
          : undefined;
      if (action.type === 'updateExam' && !previous) throw Error('changed');
      const details = validateExamDetails(
        { ...previous, ...action.changes } as Parameters<
          typeof validateExamDetails
        >[0],
        data.nodes,
        previous,
      );
      const id = previous?.id ?? 'exam:' + operationId;
      if (!previous && all.some((r: any) => r.id === id))
        throw Error('changed');
      await write('exam', id, { ...previous, ...details, id });
    }
    await write('job', operationId, {
      id: operationId,
      kind: 'navi-configuration-receipt',
      action,
      at: new Date().toISOString(),
      ...history,
    });
    check();
    await tx.done;
  } catch (error) {
    try {
      tx.abort();
    } catch {}
    await tx.done.catch(() => {});
    throw error;
  }
}

/** Restore only fields changed by this operation; subsequent edits cause an explicit conflict. */
export async function undoNaviConfiguration(operationId: string, ns: string) {
  const check = () => {
    if (ns !== currentNamespace()) throw Error('account');
    assertWritable(ns);
  };
  check();
  const db = await database();
  check();
  const tx = db.transaction(['records', 'queue'], 'readwrite'),
    records = tx.objectStore('records');
  try {
    const row = await records.get(ns + '/' + operationId);
    if (!row || row.deleted) throw Error('changed');
    const receipt = validatedConfigurationReceipt(row.payload);
    if (receipt.undoneAt) {
      await tx.done;
      return;
    }
    const all = (await records.getAll()).filter(
      (r) => r.namespace === ns && !r.deleted,
    );
    const data = projectRecords(all as LocalRecord[]);
    const current =
      receipt.recordKind === 'setting'
        ? data.settings
        : data.exams.find((e) => e.id === receipt.recordId);
    if (!current) throw Error('changed');
    for (const c of [...receipt.changes, ...(receipt.guards ?? [])])
      if (
        !equalConfigurationValue(configurationValue(current, c.path), c.after)
      )
        throw Error('changed');
    const restored: any = structuredClone(current);
    for (const change of receipt.changes)
      restoreConfigurationValue(restored, change);
    if (receipt.recordKind === 'setting') {
      validateGpaConfig(gpaConfig({ ...data, settings: restored }));
      if (
        !Number.isFinite(restored.dailyMinutes) ||
        restored.dailyMinutes < 10 ||
        restored.dailyMinutes > 120
      )
        throw Error('invalid');
      if (
        restored.studyMode &&
        !['auto', 'guided', 'manual'].includes(restored.studyMode)
      )
        throw Error('invalid');
      const weights = restored.assistant?.weights;
      if (
        weights &&
        (!Object.values(weights).some((w: any) => w > 0) ||
          Object.values(weights).some(
            (w: any) => typeof w !== 'number' || w < 0 || w > 5,
          ))
      )
        throw Error('invalid');
    } else validateExamDetails(restored as any, data.nodes, current as any);
    const at = new Date().toISOString();
    for (const next of [
      { id: receipt.recordId, kind: receipt.recordKind, payload: restored },
      {
        id: operationId,
        kind: 'job' as const,
        payload: { ...receipt, undoneAt: at },
      },
    ]) {
      check();
      const entry = {
        ...next,
        key: ns + '/' + next.id,
        namespace: ns,
        updated_at: at,
        deleted: false,
      };
      await records.put(entry);
      await tx.objectStore('queue').put(entry);
    }
    check();
    await tx.done;
  } catch (error) {
    try {
      tx.abort();
    } catch {}
    await tx.done.catch(() => {});
    throw error;
  }
}
