import type { NaviCheckRequest } from './navi-understanding';
import type {
  NaviConfigurationAction,
  configurationContext,
} from './navi-configuration';
import { apiFetch } from './runtime';
import { currentNamespace, saveRecords, loadData } from './store';
import { NaviError, verifyNaviAnswer, type NaviContext } from './navi-context';
import type { LocalRecord } from './model';
import type { NaviUIAction } from './navi-ui';
export type NaviThread = {
  id: string;
  kind: 'navi-thread';
  title: string;
  createdAt: string;
  updatedAt: string;
  contexts: NaviContext[];
};
export type NaviMessage = {
  id: string;
  kind: 'navi-message';
  threadId: string;
  role: 'user' | 'assistant';
  text: string;
  at: string;
  citations?: { source_id: string; source_version: string; quote: string }[];
  supplementary?: boolean;
  privateEvidence?: boolean;
  external_sources?: {
    source_id: string;
    url: string;
    title: string;
    version: string;
  }[];
  understanding_check?: { question: string };
  checkResponseTo?: string;
  uiQuestionId?: string;
  uiTargetId?: string;
  ui_actions?: NaviUIAction[];
  configuration_actions?: NaviConfigurationAction[];
  tutor_actions?: {
    type:
      | 'openCourse'
      | 'openQuestion'
      | 'openKnowledgeNode'
      | 'openLearningPack'
      | 'locateMaterialSource';
    id: string;
  }[];
};
export function naviThreads(jobs: any[] = []): NaviThread[] {
  return jobs
    .filter((j) => j.kind === 'navi-thread')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export function naviMessages(jobs: any[] = [], id: string): NaviMessage[] {
  return jobs
    .filter((j) => j.kind === 'navi-message' && j.threadId === id)
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}
export function newNaviThread(context?: NaviContext): NaviThread {
  const now = new Date().toISOString();
  return {
    id: 'navi-thread:' + crypto.randomUUID(),
    kind: 'navi-thread',
    title: context?.title?.slice(0, 80) || 'Navi',
    createdAt: now,
    updatedAt: now,
    contexts: context ? [context] : [],
  };
}
export async function saveNavi(
  thread: NaviThread,
  messages: NaviMessage[],
  ns = currentNamespace(),
) {
  if (ns !== currentNamespace()) throw new NaviError('save');
  const at = new Date().toISOString();
  const rows: LocalRecord[] = [
    {
      id: thread.id,
      kind: 'job',
      payload: { ...thread, updatedAt: at },
      updated_at: at,
      deleted: false,
    },
    ...messages.map((m) => ({
      id: m.id,
      kind: 'job' as const,
      payload: m,
      updated_at: at,
      deleted: false,
    })),
  ];
  if (
    !thread.id.startsWith('navi-thread:') ||
    messages.some(
      (m) => m.threadId !== thread.id || !m.id.startsWith('navi-message:'),
    )
  )
    throw new NaviError('save');
  try {
    await saveRecords(rows, true, ns);
  } catch (e) {
    throw new NaviError('save', e);
  }
}
export async function deleteNavi(id: string, ns = currentNamespace()) {
  if (ns !== currentNamespace() || !id.startsWith('navi-thread:'))
    throw new NaviError('save');
  const data = await loadData(ns),
    items = (data.jobs ?? []).filter(
      (j) =>
        (j.id === id && j.kind === 'navi-thread') ||
        (j.kind === 'navi-message' && j.threadId === id),
    );
  try {
    await saveRecords(
      items.map((payload) => ({
        id: payload.id,
        kind: 'job',
        payload,
        updated_at: new Date().toISOString(),
        deleted: true,
      })),
      true,
      ns,
    );
  } catch (e) {
    throw new NaviError('save', e);
  }
}
export async function requestNavi(
  message: string,
  contexts: NaviContext[],
  messages: NaviMessage[],
  locale: string,
  signal?: AbortSignal,
  tutor?: {
    mode: string;
    helpLevel: number;
    check?: NaviCheckRequest;
    ui?: unknown;
    configuration?: ReturnType<typeof configurationContext>;
  },
) {
  try {
    let remaining = 18000;
    const history = messages
      .slice(-12)
      .reverse()
      .flatMap((m) => {
        if (remaining <= 0) return [];
        const value = {
          role: m.role,
          text: m.text.slice(0, Math.min(6000, remaining)),
        };
        remaining -= value.text.length;
        return [value];
      })
      .reverse();
    const res = await apiFetch('/api/course', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'tutor',
        message,
        contexts,
        history,
        locale,
        tutor,
      }),
      signal: AbortSignal.any([
        AbortSignal.timeout(90000),
        ...(signal ? [signal] : []),
      ]),
    });
    const value = await res.json().catch(() => {
      throw new NaviError('format');
    });
    if (!res.ok) {
      const code = (value as any)?.code;
      throw new NaviError(
        ['context', 'timeout', 'format', 'citation', 'save'].includes(code)
          ? code
          : 'request',
      );
    }
    return verifyNaviAnswer(value, contexts);
  } catch (e) {
    if (e instanceof NaviError) throw e;
    if (e instanceof Error && e.name === 'TimeoutError')
      throw new NaviError('timeout');
    throw new NaviError('request', e);
  }
}
