import {
  naviConfigurationAction,
  type NaviConfigurationAction,
} from './navi-configuration';
import type { StudyData } from './model';

type Value = { exists: boolean; value?: unknown };
export type ConfigurationChange = {
  path: string[];
  before: Value;
  after: Value;
};
export type ConfigurationReceipt = {
  id: string;
  kind: 'navi-configuration-receipt';
  action: NaviConfigurationAction;
  at: string;
  recordKind: 'setting' | 'exam';
  recordId: string;
  changes: ConfigurationChange[];
  guards?: { path: string[]; after: Value }[];
  undoneAt?: string;
};
export const equalConfigurationValue = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
export function configurationValue(payload: unknown, path: string[]): Value {
  let value: any = payload;
  for (const key of path) {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, key))
      return { exists: false };
    value = value[key];
  }
  return value === undefined ? { exists: false } : { exists: true, value };
}
/** Only these user preferences/scheduling fields can ever be restored. Never grades or mastery. */
export function configurationPaths(
  action: NaviConfigurationAction,
): string[][] {
  switch (action.type) {
    case 'setGpaRule':
      return [['examGpa']];
    case 'setDailyTime':
      return [['dailyMinutes'], ['assistant', 'dailyMinutes']];
    case 'setLearningPreferences':
      return [
        ['studyMode'],
        ['assistant', 'weights'],
        ['assistant', 'dailyMinutes'],
        ['assistant', 'version'],
      ];
    case 'setExamScheduled':
      return [['scheduleStatus']];
    case 'createExam':
      return [['scheduleStatus']];
    case 'updateExam':
      return [
        'title',
        'subject',
        'date',
        'target',
        'dailyMinutes',
        'scope',
      ].map((k) => [k]);
  }
}
export function configurationChanges(
  action: NaviConfigurationAction,
  before: any,
  after: any,
) {
  return configurationPaths(action)
    .map((path) => ({
      path,
      before: configurationValue(before, path),
      after: configurationValue(after, path),
    }))
    .filter((v) => !equalConfigurationValue(v.before, v.after));
}
export function restoreConfigurationValue(
  payload: any,
  change: ConfigurationChange,
) {
  let current = payload;
  const parents: [any, string][] = [];
  for (const key of change.path.slice(0, -1)) {
    parents.push([current, key]);
    current[key] = { ...current[key] };
    current = current[key];
  }
  const key = change.path.at(-1)!;
  if (change.before.exists) current[key] = structuredClone(change.before.value);
  else delete current[key];
  for (const [parent, key] of parents.reverse())
    if (parent[key] && !Object.keys(parent[key]).length) delete parent[key];
}
/** Imported jobs and synced receipts are data, not authority to restore arbitrary fields. */
export function validatedConfigurationReceipt(
  input: unknown,
): ConfigurationReceipt {
  const r = input as ConfigurationReceipt;
  const action = naviConfigurationAction.parse(r?.action);
  const expectedKind = [
    'createExam',
    'updateExam',
    'setExamScheduled',
  ].includes(action.type)
    ? 'exam'
    : 'setting';
  const expectedId =
    action.type === 'createExam'
      ? 'exam:' + r.id
      : 'examId' in action
        ? action.examId
        : 'settings';
  const allowed = new Set(configurationPaths(action).map((p) => p.join('.')));
  if (
    r.kind !== 'navi-configuration-receipt' ||
    !/^navi-config:[\w-]{1,100}$/.test(r.id) ||
    r.recordKind !== expectedKind ||
    r.recordId !== expectedId ||
    !Array.isArray(r.changes) ||
    r.changes.length > 12
  )
    throw Error('invalid');
  const paths = new Set<string>();
  for (const c of r.changes) {
    if (
      !Array.isArray(c.path) ||
      !allowed.has(c.path.join('.')) ||
      paths.has(c.path.join('.')) ||
      typeof c.before?.exists !== 'boolean' ||
      typeof c.after?.exists !== 'boolean'
    )
      throw Error('invalid');
    paths.add(c.path.join('.'));
  }
  if (
    r.guards &&
    (action.type !== 'createExam' ||
      !Array.isArray(r.guards) ||
      r.guards.length > 7 ||
      r.guards.some(
        (g) =>
          ![
            'title',
            'subject',
            'date',
            'target',
            'dailyMinutes',
            'scope',
            'scheduleStatus',
          ].includes(g.path?.join('.')) || typeof g.after?.exists !== 'boolean',
      ))
  )
    throw Error('invalid');
  return { ...r, action };
}
export function findConfigurationReceipt(data: StudyData, id: string) {
  const job = data.jobs?.find(
    (j) => j.id === id && j.kind === 'navi-configuration-receipt',
  );
  if (!job) return null;
  try {
    return validatedConfigurationReceipt(job);
  } catch {
    return null;
  }
}
