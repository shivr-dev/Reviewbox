'use client';
import NaviAvatar, { type NaviMotionState } from './navi-avatar';
import NaviErrorDetails from './navi-error-details';
import {diagnoseNaviFailure,type NaviDiagnostic} from '@/lib/navi-diagnostics';
import {permitMembership} from '@/lib/membership-client';

import NaviWebSearch from './navi-web-search';
import { safeNaviWebURL, parseNaviWebIntent } from '@/lib/navi-web-sources';
import NaviConfigurationPreview from './navi-configuration-preview';
import NaviConfigurationReceipt from './navi-configuration-receipt';
import NaviUnderstandingCheck from './navi-understanding-check';
import NaviSelectionEntry from './navi-selection-entry';
import { findConfigurationReceipt } from '@/lib/navi-configuration-history';
import type { NaviCheckRequest } from '@/lib/navi-understanding';
import {
  configurationContext,
  offlineConfigurationRequest,
  type NaviConfigurationAction,
} from '@/lib/navi-configuration';
import { useEffect, useRef, useState } from 'react';
import {
  MoreHorizontal,
  Plus,
  Trash2,
  X,
  FileText,
  ArrowUpRight,
  ArrowUp,
  Square,
  Maximize2,
  Minimize2,
  ChevronLeft,
  BookmarkPlus,
  Plug,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import i18n, { tr, formatDate } from '@/lib/i18n';
import { currentNamespace, put } from '@/lib/store';
import {
  resolveNaviContext,
  NaviError,
  naviSearchConditions,
  type NaviTarget,
} from '@/lib/navi-context';
import {
  newNaviThread,
  naviThreads,
  naviMessages,
  saveNavi,
  deleteNavi,
  requestNavi,
  type NaviThread,
  type NaviMessage,
} from '@/lib/navi-client';
import { useReview } from './review-context';
import MathText from './math-text';
import { listCommunity } from '@/lib/community-client';
import { naviContextSchema } from '@/lib/navi-context';
import { requestCommunitySearch } from '@/lib/community-navigation';
import { parseWorkspaceRoute } from '@/lib/workspace-route';
import { watchRequest } from '@/lib/watch-client';
import { validatePack } from '@/lib/importer';
import type { Pack } from '@/lib/model';
import {
  currentNaviUI,
  executeNaviUI,
  parseNaviUICommand,
  focusNaviTarget,
  type NaviUIAction,
  canAutoApplyNaviUI,
  parseNaviToolIntent,
} from '@/lib/navi-ui';
import { relatedNaviEvidence } from '@/lib/navi-evidence';
import NaviPracticePreview from './navi-practice-preview';
import NaviActionPreview from './navi-action-preview';
import { queryNaviContexts, naviSourceData } from '@/lib/navi-query';
import { NaviActivity, NaviLayer, NaviSurface } from './navi-presentation';
import NaviResponse from './navi-response';
const t = (key: string) => tr('study:navi.' + key);
export function openNavi(target?: NaviTarget) {
  window.dispatchEvent(new CustomEvent('review:navi', { detail: target }));
}
export function openPageNavi() {
  window.dispatchEvent(new Event('review:navi-page'));
}
export function composeNavi(text: string) {
  window.dispatchEvent(
    new CustomEvent('review:navi', {
      detail: { type: 'plan', id: 'current', draft: text.slice(0, 2500) },
    }),
  );
}
export function openNaviEditor(target: NaviTarget) {
  window.dispatchEvent(
    new CustomEvent('review:navi', { detail: { ...target, editor: true } }),
  );
}
export function openNaviPublic(id: string) {
  window.dispatchEvent(
    new CustomEvent('review:navi-public', { detail: { id } }),
  );
}
export function NaviButton({ target, iconOnly = false, motion = 'idle' }: { target: NaviTarget; iconOnly?: boolean; motion?: NaviMotionState }) {
  useTranslation();
  return (
    <button
      type="button"
      className={iconOnly ? 'guided-navi-button' : 'text-button'}
      aria-label={iconOnly ? 'Navi' : undefined}
      onClick={() =>
        openNavi({
          ...target,
          selectedText: window.getSelection()?.toString().slice(0, 1800),
        })
      }
    >
      {iconOnly ? <NaviAvatar size={108} state={motion} label={null} /> : 'Navi'}
    </button>
  );
}
export default function NaviWorkspace() {
  useTranslation();
  const { data, states, refresh, navigate, notify, aiReady, cloudUser } =
      useReview(),
    ns = currentNamespace();
  const [research, setResearch] = useState(false),
    [researchQuery, setResearchQuery] = useState('');
  const [configuration, setConfiguration] = useState<{
    action: NaviConfigurationAction;
    id: string;
  } | null>(null);
  const [consent, setConsent] = useState(false),
    [tutorMode, setTutorMode] = useState('auto'),
    [helpLevel, setHelpLevel] = useState(() =>
      data.settings.learningProfile?.independent !== false ? 1 :
        data.settings.learningProfile?.help === 'steps' ? 3 : 1),
    [membershipMode,setMembershipMode]=useState<'navi_basic'|'navi_deep'|'agent'>('navi_basic'),[membershipTrial,setMembershipTrial]=useState<''|'plus'|'pro'>(''),
    [pendingNote, setPendingNote] = useState<NaviMessage | null>(null),
    [practice, setPractice] = useState(false),
    [receipt, setReceipt] = useState(''),
    [operationMotion, setOperationMotion] = useState<'success' | 'error' | null>(null),
    [savingNote, setSavingNote] = useState(false);
  const [publicPack, setPublicPack] = useState<Pack | null>(null),
    [loadingPack, setLoadingPack] = useState(false);
  const [editorRequested, setEditorRequested] = useState(false);
  const [menu, setMenu] = useState(false),
    [pendingUI, setPendingUI] = useState<NaviMessage | null>(null),
    [autoSaving, setAutoSaving] = useState(false);
  const autoUI =
    data.jobs?.find(
      (j) => j.id === 'navi-ui-preferences' && j.kind === 'navi-preferences',
    )?.autoUI === true;
  async function saveAutoUI(enabled: boolean) {
    if (autoSaving) return;
    const owner = ns;
    setAutoSaving(true);
    try {
      await put(
        'job',
        {
          id: 'navi-ui-preferences',
          kind: 'navi-preferences',
          autoUI: enabled,
        },
        'navi-ui-preferences',
        false,
        owner,
      );
      if (currentNamespace() === owner) await refresh();
    } catch {
      setError(t('error.save'));
    } finally {
      setAutoSaving(false);
    }
  }
  function closeTool() {
    setResearch(false);
    setConfiguration(null);
    setPendingUI(null);
    setPendingNote(null);
    setPractice(false);
    setEditorRequested(false);
    window.dispatchEvent(new Event('review:navi-close'));
  }
  useEffect(() => {
    const close = () => setEditorRequested(false);
    window.addEventListener('review:navi-tool-close', close);
    return () => window.removeEventListener('review:navi-tool-close', close);
  }, []);
  const [open, setOpen] = useState(false),
    [fullscreen, setFullscreen] = useState(false),
    [thread, setThread] = useState<NaviThread | null>(null),
    [draft, setDraft] = useState(''),
    [busy, setBusy] = useState(false),
    [requestPending, setRequestPending] = useState(false),
    [replyMotion, setReplyMotion] = useState<'explaining' | 'guiding' | null>(null),
    [resting, setResting] = useState(false),
    [motionRun, setMotionRun] = useState(0),
    [error, setErrorText] = useState(''),
    [diagnostic,setDiagnostic]=useState<NaviDiagnostic|null>(null),
    [pendingDelete, setPendingDelete] = useState('');
  function setError(value:string){setErrorText(value);setDiagnostic(null);}
  function showOutcome(state: 'success' | 'error') {
    setOperationMotion(state);
    setMotionRun((run) => run + 1);
  }
  const hasProposal = !!(research || configuration || pendingUI || pendingNote || practice || editorRequested);
  const avatarState: NaviMotionState = !open ? 'sleeping' : requestPending || loadingPack ? 'thinking' :
    error ? 'error' : operationMotion ?? (hasProposal ? 'guiding' : replyMotion ?? (resting ? 'sleeping' : 'idle'));
  const draftNeedsConnection = !aiReady && !!draft.trim() &&
    !parseNaviUICommand(draft) && !parseNaviToolIntent(draft) &&
    !offlineConfigurationRequest(draft) && parseNaviWebIntent(draft) === undefined;
  const canSuggestFollowups = aiReady && !busy && !draft.trim() && !hasProposal;
  function openConnectionSettings() {
    setOpen(false);
    setMenu(false);
    navigate('you', 'all', 'advanced');
  }
  useEffect(() => {
    if (!operationMotion && !replyMotion) return;
    const timeout = window.setTimeout(() => {
      setOperationMotion(null);
      setReplyMotion(null);
    }, operationMotion ? 1650 : 6500);
    return () => window.clearTimeout(timeout);
  }, [operationMotion, replyMotion, motionRun]);
  useEffect(() => {
    if (!open) return;
    setResting(false);
    if (busy || hasProposal) return;
    const timeout = window.setTimeout(() => setResting(true), 60000);
    return () => window.clearTimeout(timeout);
  }, [open, busy, draft, hasProposal, thread?.id, motionRun]);
  const gate = useRef(false),
    controller = useRef<AbortController | null>(null),
    activeThread = useRef<NaviThread | null>(null),
    field = useRef<HTMLTextAreaElement>(null),
    scroller = useRef<HTMLDivElement>(null),
    follow = useRef(true);
  useEffect(() => {
    activeThread.current = thread;
  }, [thread]);
  useEffect(() => {
    if (follow.current && scroller.current)
      scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [data.jobs, open, busy, loadingPack]);
  const threads = naviThreads(data.jobs),
    messages = thread ? naviMessages(data.jobs, thread.id) : [];
  const sourceData = naviSourceData(
      data,
      publicPack,
      thread?.contexts.find((c) => c.context_type === 'pack')?.source_id,
    ),
    currentQuestion = sourceData.questions.find((q) =>
      thread?.contexts.some(
        (c) => c.context_type === 'question' && c.source_id === q.id,
      ),
    );
  const courseContext = thread?.contexts.find(
    (c) => c.context_type === 'course',
  );
  useEffect(() => {
    if (editorRequested && open && courseContext)
      window.dispatchEvent(
        new CustomEvent('review:navi-course-editor', {
          detail: {
            courseId: courseContext.source_id,
            sectionId: courseContext.source_location.section_id,
          },
        }),
      );
  }, [
    editorRequested,
    open,
    courseContext?.source_id,
    courseContext?.source_location.section_id,
  ]);
  useEffect(() => {
    if (!open) window.dispatchEvent(new Event('review:navi-close'));
  }, [open]);
  useEffect(() => {
    setConsent(false);
    setResearch(false);
    setConfiguration(null);
    setPractice(false);
    setPendingNote(null);
    setReceipt('');
    setOperationMotion(null);
    setReplyMotion(null);
    setPendingUI(null);
    setMenu(false);
  }, [thread?.id, ns]);
  async function applyUI(
    actions: NaviUIAction[],
    questionId?: string,
    targetId?: string,
    membershipReceipt?:string,
  ) {
    if (
      (targetId && currentNaviUI()?.target?.id !== targetId) ||
      (questionId &&
        currentNaviUI()?.readEvidence?.().questionId !== questionId)
    ) {
      setReceipt(t('live.error.unsupported'));
      showOutcome('error');
      return false;
    }
    try{await permitMembership('workspace',membershipReceipt);}catch(e){setReceipt((e as Error).message);showOutcome('error');return false;}
    const result = executeNaviUI(actions);
    setReceipt(
      result.ok ? t('live.applied') : t('live.error.' + result.reason),
    );
    showOutcome(result.ok ? 'success' : 'error');
    return result.ok;
  }
  function openAction(
    action: NonNullable<NaviMessage['tutor_actions']>[number],
  ) {
    const course =
        action.type === 'openCourse' &&
        data.jobs?.find((j) => j.kind === 'course' && j.id === action.id),
      question =
        action.type === 'openQuestion' &&
        data.questions.find((q) => q.id === action.id),
      node =
        action.type === 'openKnowledgeNode' &&
        data.nodes.find((n) => n.id === action.id),
      pack =
        action.type === 'openLearningPack' &&
        data.packs.find((p) => p.id === action.id),
      material =
        action.type === 'locateMaterialSource' &&
        data.materials.find((m) => m.id === action.id);
    if (course) {
      setOpen(false);
      navigate('course', course.id);
      return;
    }
    if (!question && !node && !pack && !material) {
      setError(t('error.context'));
      return;
    }
    setOpen(false);
    if (node) navigate('subjects', node.subject, 'map');
    else {
      navigate(
        'subjects',
        question ? question.subject : material ? material.subject : 'all',
        question ? 'questions' : pack ? 'packs' : 'materials',
      );
      history.replaceState(
        history.state,
        '',
        location.hash + '/' + encodeURIComponent(action.id),
      );
      window.dispatchEvent(
        new CustomEvent('review:focus-source', {
          detail: {
            type: question ? 'question' : pack ? 'pack' : 'material',
            id: action.id,
          },
        }),
      );
    }
  }
  async function saveNote() {
    if (!pendingNote || savingNote) return;
    const nodeId = thread?.contexts
      .flatMap((c) => c.knowledge_refs)
      .find((id) => data.nodes.some((n) => n.id === id));
    if (!nodeId) {
      setError(t('error.context'));
      return;
    }
    const owner = ns;
    setSavingNote(true);
    try {
      await put(
        'note',
        {
          id: crypto.randomUUID(),
          nodeId,
          body:
            pendingNote.text +
            (pendingNote.citations?.length
              ? '\n\n' +
                pendingNote.citations
                  .map(
                    (c) =>
                      c.source_id + ' @ ' + c.source_version + '\n> ' + c.quote,
                  )
                  .join('\n\n')
              : ''),
        },
        undefined,
        false,
        owner,
      );
      if (currentNamespace() === owner) {
        setPendingNote(null);
        notify(t('savedNote'));
        showOutcome('success');
        await refresh();
      }
    } catch {
      if (currentNamespace() === owner) setError(t('error.save'));
    } finally {
      setSavingNote(false);
    }
  }
  useEffect(() => {
    const owner = ns;
    let alive = true;
    const handler = async (e: Event) => {
      setOpen(true);
      setError('');
      try {
        const id = (e as CustomEvent).detail?.id;
        if (typeof id !== 'string') throw new NaviError('context');
        const { packs } = await listCommunity({ id, limit: 1 });
        if (!alive || currentNamespace() !== owner) return;
        const pack = packs[0];
        if (!pack || pack.id !== id) throw new NaviError('context');
        setThread(
          newNaviThread(
            naviContextSchema.parse({
              context_type: 'pack',
              source_id: id,
              source_version: pack.version,
              title: pack.title,
              relevant_content: JSON.stringify({
                title: pack.title,
                description: pack.description,
                metadata: pack.metadata,
              }),
              selected_text: '',
              related_question_ids: [],
              knowledge_refs: [],
              source_location: {},
              provenance: 'learning-pack',
            }),
          ),
        );
        setDraft('');
      } catch {
        if (alive && currentNamespace() === owner) setError(t('error.context'));
      }
    };
    window.addEventListener('review:navi-public', handler);
    return () => {
      alive = false;
      window.removeEventListener('review:navi-public', handler);
    };
  }, [ns]);
  useEffect(() => {
    let alive = true;
    const owner = ns;
    const handler = async (e: Event) => {
      try {
        const target = (
            e as CustomEvent<
              (NaviTarget & { editor?: boolean; draft?: string }) | undefined
            >
          ).detail,
          context = target ? resolveNaviContext(data, target) : undefined;
        if (context && target?.draft === undefined && !target?.editor && !target?.selectedText &&
          activeThread.current?.contexts.some(saved =>
            saved.context_type === context.context_type &&
            saved.source_id === context.source_id &&
            saved.source_version === context.source_version &&
            saved.source_location.section_id === context.source_location.section_id)) {
          setOpen(true);
          return;
        }
        if (target) focusNaviTarget(target);
        setEditorRequested(!!target?.editor);
        let next = newNaviThread(context);
        setDraft(
          typeof target?.draft === 'string' ? target.draft.slice(0, 2500) : '',
        );
        setError('');
        setOpen(true);
        if (target?.type === 'course') {
          const course = data.jobs?.find(
              (j) => j.kind === 'course' && j.id === target.id,
            ),
            legacy = (course?.chat ?? []).filter(
              (m: any) => m.sectionId === context?.source_location.section_id,
            ),
            id =
              'navi-thread:legacy:' +
              target.id +
              ':' +
              context?.source_location.section_id;
          const previous = naviThreads(data.jobs).find((t) => t.id === id);
          if (previous) next = previous;
          else if (legacy.length) {
            next = { ...next, id };
            setThread(next);
            await saveNavi(
              next,
              legacy.map((m: any, i: number) => ({
                id: 'navi-message:legacy:' + id + ':' + i,
                kind: 'navi-message',
                threadId: id,
                role: m.role,
                text: m.text,
                at: m.at,
                supplementary: m.role === 'assistant',
              })),
              owner,
            );
            if (!alive || currentNamespace() !== owner) return;
            await refresh();
          }
        }
        if (alive && currentNamespace() === owner) setThread(next);
      } catch (e) {
        if (alive && currentNamespace() === owner) {
          setError(t('error.' + (e instanceof NaviError ? e.code : 'context')));
          setOpen(true);
        }
      }
    };
    window.addEventListener('review:navi', handler);
    return () => {
      alive = false;
      window.removeEventListener('review:navi', handler);
    };
  }, [data, ns]);
  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [ns],
  );
  useEffect(() => {
    if (open) field.current?.focus();
  }, [open, thread?.id]);
  useEffect(() => {
    setPublicPack(null);
  }, [thread?.id]);
  async function readPublicQuestions() {
    const context = thread?.contexts.find((c) => c.context_type === 'pack');
    if (!context || !cloudUser || loadingPack) return;
    const owner = ns;
    setLoadingPack(true);
    setError('');
    try {
      const response = await watchRequest('pack-get', {
        id: context.source_id,
      });
      if (currentNamespace() !== owner) return;
      setPublicPack(validatePack(response.pack));
    } catch {
      if (currentNamespace() === owner) setError(t('error.context'));
    } finally {
      if (currentNamespace() === owner) setLoadingPack(false);
    }
  }
  function choosePublicQuestion(id: string) {
    if (!publicPack || !thread) return;
    try {
      const context = resolveNaviContext(
        naviSourceData(
          data,
          publicPack,
          thread.contexts.find((c) => c.context_type === 'pack')?.source_id,
        ),
        { type: 'question', id },
      );
      setThread({
        ...thread,
        contexts: [
          ...thread.contexts.filter((c) => c.context_type !== 'question'),
          context,
        ].slice(-3),
      });
    } catch {
      setError(t('error.context'));
    }
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        controller.current?.abort();
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [open]);
  async function send(
    input = draft,
    check?: NaviCheckRequest,
    responseTo?: string,
  ) {
    if (gate.current || !input.trim()) return;
    gate.current = true;
    follow.current = true;
    setBusy(true);
    setReplyMotion(null);
    setOperationMotion(null);
    setError('');
    controller.current = new AbortController();
    const owner = ns,
      current = thread ?? newNaviThread(),
      at = new Date().toISOString(),
      text = input.trim();
    const user: NaviMessage = {
      id: 'navi-message:' + crypto.randomUUID(),
      kind: 'navi-message',
      threadId: current.id,
      role: 'user',
      checkResponseTo: responseTo,
      text,
      at,
    };
    const next = {
      ...current,
      title: !messages.length ? text.slice(0, 70) : current.title,
    };
    setThread(next);
    try {
      await saveNavi(next, [user], owner);
      await refresh();
      const webQuery = check ? undefined : parseNaviWebIntent(text);
      if (webQuery !== undefined) {
        closeTool();
        setResearchQuery(webQuery);
        setResearch(true);
        await saveNavi(
          next,
          [
            {
              id: 'navi-message:' + crypto.randomUUID(),
              kind: 'navi-message',
              threadId: next.id,
              role: 'assistant',
              text: t('web.privacy'),
              at: new Date().toISOString(),
            },
          ],
          owner,
        );
        setDraft('');
        await refresh();
        return;
      }
      const offlineAction =
        !check && !aiReady ? offlineConfigurationRequest(text) : undefined;
      if (offlineAction) {
        await permitMembership('workflows');
        closeTool();
        const id = 'navi-message:' + crypto.randomUUID();
        setConfiguration({ action: offlineAction, id });
        setMenu(false);
        await saveNavi(
          next,
          [
            {
              id,
              kind: 'navi-message',
              threadId: next.id,
              role: 'assistant',
              text: t('tool.ready'),
              at: new Date().toISOString(),
              configuration_actions: [offlineAction],
            },
          ],
          owner,
        );
        setDraft('');
        await refresh();
        return;
      }
      const tool = check ? undefined : parseNaviToolIntent(text);
      if (
        tool &&
        (tool === 'practice'
          ? !!currentQuestion
          : tool === 'save-note'
            ? messages.some((m) => m.role === 'assistant')
            : !!courseContext)
      ) {
        closeTool();
        setMenu(false);
        if (tool === 'practice') setPractice(true);
        else if (tool === 'save-note')
          setPendingNote(
            [...messages].reverse().find((m) => m.role === 'assistant')!,
          );
        else {
          setEditorRequested(true);
          window.dispatchEvent(
            new CustomEvent('review:navi-course-editor', {
              detail: {
                courseId: courseContext!.source_id,
                sectionId: courseContext!.source_location.section_id,
              },
            }),
          );
        }
        await saveNavi(
          next,
          [
            {
              id: 'navi-message:' + crypto.randomUUID(),
              kind: 'navi-message',
              threadId: next.id,
              role: 'assistant',
              text: t('tool.ready'),
              at: new Date().toISOString(),
            },
          ],
          owner,
        );
        setDraft('');
        await refresh();
        return;
      }
      const commands = check ? undefined : parseNaviUICommand(text);
      if (commands) {
        await permitMembership('workspace');
        const result = executeNaviUI(commands);
        showOutcome(result.ok ? 'success' : 'error');
        const reply = result.ok
          ? t('live.applied')
          : t('live.error.' + result.reason);
        await saveNavi(
          next,
          [
            {
              id: 'navi-message:' + crypto.randomUUID(),
              kind: 'navi-message',
              threadId: next.id,
              role: 'assistant',
              text: reply,
              at: new Date().toISOString(),
            },
          ],
          owner,
        );
        setDraft('');
        await refresh();
        return;
      }
      let pack = publicPack;
      const publicContext = next.contexts.find(
        (c) =>
          c.context_type === 'pack' &&
          !data.packs.some((p) => p.id === c.source_id),
      );
      if (publicContext && cloudUser && !pack) {
        setLoadingPack(true);
        try {
          const response = await watchRequest('pack-get', {
            id: publicContext.source_id,
          });
          if (currentNamespace() !== owner) return;
          pack = validatePack(response.pack);
          setPublicPack(pack);
        } finally {
          setLoadingPack(false);
        }
      }
      const retrieved = queryNaviContexts(data, next.contexts, text, pack),
        live = currentNaviUI(),
        boundTarget = live?.target?.id,
        evidence = relatedNaviEvidence(
          data,
          retrieved,
          consent,
          live?.readEvidence?.(),
          states,
        ),
        contexts = evidence ? [...retrieved.slice(-2), evidence] : retrieved;
      const updatedThread = { ...next, contexts: retrieved };
      setThread(updatedThread);
      if (
        next.contexts.some((c) =>
          c.related_question_ids.includes(
            live?.readEvidence?.().questionId ?? '',
          ),
        )
      )
        live?.assistance?.(
          /完整|直接.*答案|full explanation|complete solution/i.test(text)
            ? 4
            : (helpLevel as 1 | 2 | 3 | 4),
        );
      setRequestPending(true);
      const answer = await requestNavi(
        text,
        contexts,
        messages.filter((m) => consent || !m.privateEvidence),
        i18n.resolvedLanguage ?? 'zh-CN',
        controller.current.signal,
        {
          mode: tutorMode,
          helpLevel,
          check,
          configuration: configurationContext(
            data,
            text +
              ' ' +
              messages
                .filter((m) => m.role === 'user')
                .slice(-2)
                .map((m) => m.text)
                .join(' '),
          ),
          ui: live
            ? {
                ...live.capabilities,scrollTargets:live.capabilities.scrollTargets?.slice(0,500),scientificIds:live.capabilities.scientificIds?.slice(0,100),
                questionIds: live.capabilities.questionIds.slice(0, 30),
                knowledgeIds: live.capabilities.knowledgeIds?.slice(0, 30),
                state: live.snapshot(),
                target: live.target,
              }
            : undefined,
        },{capability:membershipMode,trial:membershipTrial||undefined},
      );
      setRequestPending(false);
      setMembershipTrial('');
      if (currentNamespace() !== owner || controller.current.signal.aborted) return;
      let autoApplied = false;
      if (
        autoUI &&
        answer.ui_actions?.length &&
        live === currentNaviUI() &&
        canAutoApplyNaviUI(answer.ui_actions, live.capabilities)
      ) {
        const result = live.execute(answer.ui_actions, 'suggestion');
        autoApplied = result.ok;
        if (result.ok) setReceipt(t('tool.autoApplied'));
        showOutcome(result.ok ? 'success' : 'error');
      }
      const responseId = 'navi-message:' + crypto.randomUUID();
      if (answer.configuration_actions?.[0]) {
        closeTool();
        setConfiguration({
          action: answer.configuration_actions[0],
          id: responseId,
        });
        setMenu(false);
      }
      if (answer.ui_actions?.length && !autoApplied) {
        setPendingUI({
          id: responseId,
          kind: 'navi-message',
          threadId: next.id,
          role: 'assistant',
          text: answer.reply,
          at: new Date().toISOString(),
          ui_actions: answer.ui_actions,membershipReceipt:answer.membershipReceipt,
          uiTargetId: boundTarget,
          uiQuestionId: live?.readEvidence?.().questionId,
        });
        setMenu(false);
      }
      await saveNavi(
        updatedThread,
        [
          {
            id: responseId,
            kind: 'navi-message',
            threadId: next.id,
            role: 'assistant',
            text: answer.reply,
            at: new Date().toISOString(),
            citations: answer.citations,
            supplementary: answer.supplementary,
            privateEvidence: !!evidence,
            ui_actions: answer.ui_actions,membershipReceipt:answer.membershipReceipt,
            tutor_actions: answer.tutor_actions,
            configuration_actions: answer.configuration_actions,
            uiQuestionId: live?.readEvidence?.().questionId,
            uiTargetId: boundTarget,
          },
        ],
        owner,
      );
      setDraft('');
      await refresh();
      if (currentNamespace() === owner && !controller.current.signal.aborted) {
        const answeringWithHint = (check?.phase === 'ask' || (tutorMode === 'problem' || Boolean(currentQuestion)) && helpLevel < 4 && !/完整|直接.*答案|full explanation|complete solution/i.test(text));
        setReplyMotion(answeringWithHint ? 'guiding' : 'explaining');
        setMotionRun((run) => run + 1);
      }
    } catch (e) {
      if (currentNamespace() === owner && !controller.current.signal.aborted){
        setError(t('error.' + (e instanceof NaviError ? e.code : 'request')));
        setDiagnostic(diagnoseNaviFailure(e,'client'));
      }
    } finally {
      gate.current = false;
      if (currentNamespace() === owner) {
        setBusy(false);
        setRequestPending(false);
      }
    }
  }
  function sourceGo(id: string) {
    const context = thread?.contexts.find((c) => c.source_id === id);
    if (!context) return;
    setOpen(false);
    if (context.context_type === 'web') {
      const url = safeNaviWebURL(context.source_location.external_url ?? '');
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    if (context.context_type === 'plan') {
      navigate('plan');
      return;
    }
    if (context.context_type === 'subject') {
      navigate('subjects', id);
      return;
    }
    if (
      context.context_type === 'question' &&
      !data.questions.some((q) => q.id === id)
    ) {
      const packContext = thread?.contexts.find(
        (c) => c.context_type === 'pack',
      );
      if (packContext) {
        navigate('subjects', 'all', 'discover');
        return;
      }
    }
    if (context.context_type === 'course')
      navigate('course', id, context.source_location.section_id ?? '');
    else {
      const publicPack =
        context.context_type === 'pack' && !data.packs.some((p) => p.id === id);
      navigate(
        'subjects',
        'all',
        context.context_type === 'pack'
          ? publicPack
            ? 'discover'
            : 'packs'
          : context.context_type === 'material'
            ? 'materials'
            : 'questions',
      );
      history.replaceState(
        history.state,
        '',
        location.hash + '/' + encodeURIComponent(id),
      );
      window.dispatchEvent(
        new CustomEvent('review:focus-source', {
          detail: { type: context.context_type, id },
        }),
      );
    }
  }

  function openCurrentPage() {
    const route = parseWorkspaceRoute(location.hash),
      course = data.jobs?.find(
        (j) => j.kind === 'course' && j.id === route.subject,
      ),
      question = currentNaviUI()?.readEvidence?.().questionId;
    let target: NaviTarget | undefined;
    if (route.page === 'course' && course)
      target = {
        type: 'course',
        id: course.id,
        sectionId: course.sections[course.current]?.id,
        selectedText: window.getSelection()?.toString().slice(0, 1800),
      };
    else if (question) target = { type: 'question', id: question };
    else if (currentNaviUI()?.target) target = currentNaviUI()!.target;
    else if (['home', 'plan'].includes(route.page))
      target = { type: 'plan', id: 'current' };
    const currentContext =
      target &&
      thread?.contexts.some(
        (c) =>
          c.context_type === target.type &&
          c.source_id === target.id &&
          (!target.sectionId ||
            c.source_location.section_id === target.sectionId),
      );
    if (target && !currentContext) openNavi(target);
    else {
      setOpen(true);
      if (!thread) setThread(newNaviThread());
    }
  }
  useEffect(() => {
    window.addEventListener('review:navi-page', openCurrentPage);
    return () =>
      window.removeEventListener('review:navi-page', openCurrentPage);
  });

  const toolMessageId =
    configuration?.id ??
    pendingUI?.id ??
    pendingNote?.id ??
    messages.findLast((m) => m.role === 'assistant')?.id;
  const inlineTool = (
    <section
      className="navi-tool-tray navi-inline-tool"
      data-tool={research ? 'web' : undefined}
      hidden={
        !pendingUI &&
        !pendingNote &&
        !practice &&
        !editorRequested &&
        !configuration &&
        !research
      }
      aria-label={t(research ? 'web.title' : 'tool.title')}
    >
      <header>
        {!research && <strong>{t('tool.title')}</strong>}
        <button type="button" aria-label={t('tool.close')} onClick={closeTool}>
          <X size={17} />
        </button>
      </header>
      <div className="navi-tool-body">
        {research && (
          <NaviWebSearch
            key={researchQuery}
            initialQuery={researchQuery}
            onChoose={async (context) => {
              const next = thread ?? newNaviThread();
              const updated = {
                ...next,
                contexts: [
                  ...next.contexts
                    .filter((c) => c.source_id !== context.source_id)
                    .slice(-2),
                  context,
                ],
              };
              await saveNavi(
                updated,
                [
                  {
                    id: 'navi-message:' + crypto.randomUUID(),
                    kind: 'navi-message',
                    threadId: next.id,
                    role: 'assistant',
                    text: t('web.added') + '\n' + context.title,
                    at: new Date().toISOString(),
                    citations: [
                      {
                        source_id: context.source_id,
                        source_version: context.source_version,
                        quote: context.title,
                      },
                    ],
                    external_sources: [
                      {
                        source_id: context.source_id,
                        url: context.source_location.external_url!,
                        title: context.title,
                        version: context.source_version,
                      },
                    ],
                  },
                ],
                ns,
              );
              if (currentNamespace() !== ns) return;
              setThread(updated);
              await refresh();
              notify(t('web.added'));
              setResearch(false);
            }}
          />
        )}
        {configuration && (
          <NaviConfigurationPreview
            key={configuration.id}
            action={configuration.action}
            operationId={
              'navi-config:' + configuration.id.replace('navi-message:', '')
            }
            onClose={() => setConfiguration(null)}
            onOutcome={showOutcome}
          />
        )}
        {pendingUI && (
          <NaviActionPreview
            key={pendingUI.id}
            actions={pendingUI.ui_actions!}
            onAccept={async() => {
              if (
                await applyUI(
                  pendingUI.ui_actions!,
                  pendingUI.uiQuestionId,
                  pendingUI.uiTargetId,pendingUI.membershipReceipt,
                )
              )
                setPendingUI(null);
            }}
            onCancel={() => setPendingUI(null)}
          />
        )}
        {pendingNote && (
          <section className="navi-operation-preview">
            <h3>{t('notePreview')}</h3>
            <MathText>{pendingNote.text}</MathText>
            <button
              type="button"
              disabled={savingNote}
              onClick={() => void saveNote()}
            >
              {t('confirm')}
            </button>
            <button type="button" onClick={() => setPendingNote(null)}>
              {t('cancel')}
            </button>
          </section>
        )}
        <div id="navi-course-editor-host" hidden={!editorRequested} />
        {practice && currentQuestion && thread && (
          <NaviPracticePreview
            sourcePack={publicPack ?? undefined}
            key={thread.id + currentQuestion.id}
            question={currentQuestion}
            threadId={thread.id}
            onClose={() => setPractice(false)}
            onOutcome={showOutcome}
          />
        )}
      </div>
    </section>
  );
  return (
    <NaviLayer>
      <NaviSelectionEntry
        onChoose={(target) => {
          openNavi({
            ...target,
            draft: t('selection.request'),
          } as NaviTarget & { draft: string });
        }}
      />
      <button
        className="navi-launcher"
        onClick={openCurrentPage}
        aria-expanded={open}
        aria-controls="navi-workspace"
      >
        <span>Navi</span>
      </button>
      {open && (
        <NaviSurface label={t('title')} fullscreen={fullscreen}>
          <header>
            <div><strong>Navi</strong></div>
            <button
              type="button"
              aria-label={t('tool.menu')}
              aria-expanded={menu}
              onClick={() => setMenu((v) => !v)}
            >
              <MoreHorizontal size={20} />
            </button>
            <button
              type="button"
              aria-label={t('close')}
              onClick={() => {
                setOpen(false);
                controller.current?.abort();
              }}
            >
              <ChevronLeft size={19} className="navi-collapse-arrow" />
            </button>
          </header>
          {menu && (
            <section className="navi-menu" aria-label={t('tool.menu')}>
              <div className="navi-menu-commands">
                <button type="button" onClick={() => {
                  setFullscreen(v => !v);
                  setMenu(false);
                }}>
                  {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                  {t(fullscreen ? 'display.dock' : 'display.fullscreen')}
                </button>
                {!aiReady && <button type="button" onClick={openConnectionSettings}>
                  <Plug size={16} />{t('connect')}
                </button>}
                <button type="button" disabled={busy} onClick={() => {
                  setMenu(false);
                  closeTool();
                  setResearch(true);
                }}>{t('web.title')}</button>
                {currentNaviUI() && !currentNaviUI()?.capabilities.protected && (
                  <button type="button" disabled={busy} onClick={() => {
                    window.dispatchEvent(new CustomEvent('review:navi-workspace-tools', { detail: currentNaviUI() }));
                    setMenu(false);
                    setOpen(false);
                  }}>
                    {t('live.tools')}
                  </button>
                )}
              </div>
              <nav aria-label={t('history')}>
                <button
                  disabled={busy}
                  onClick={() => {
                    setThread(newNaviThread());
                    setMenu(false);
                    closeTool();
                    setDraft('');
                    setError('');
                  }}
                >
                  <Plus size={16} />
                  {t('new')}
                </button>
                <select
                  aria-label={t('history')}
                  value={
                    threads.some((t) => t.id === thread?.id) ? thread?.id : ''
                  }
                  disabled={busy}
                  onChange={(e) => {
                    setThread(
                      threads.find((t) => t.id === e.target.value) ??
                        newNaviThread(),
                    );
                    setError('');
                    setMenu(false);
                    closeTool();
                  }}
                >
                  <option value="">{t('history')}</option>
                  {threads.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.title} · {formatDate(v.updatedAt)}
                    </option>
                  ))}
                </select>
                {thread && threads.some((t) => t.id === thread.id) && (
                  <button
                    aria-label={t('delete')}
                    disabled={busy}
                    onClick={() => setPendingDelete(thread.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </nav>
              {pendingDelete && (
                <div className="navi-delete" role="alert">
                  <p>{t('deleteConfirm')}</p>
                  <button
                    onClick={() =>
                      void deleteNavi(pendingDelete, ns)
                        .then(() => {
                          setThread(newNaviThread());
                          setPendingDelete('');
                          return refresh();
                        })
                        .catch(() => setError(t('error.save')))
                    }
                  >
                    {t('delete')}
                  </button>
                  <button onClick={() => setPendingDelete('')}>
                    {t('cancel')}
                  </button>
                </div>
              )}
              {!!thread?.contexts.length && (
                <section className="navi-context">
                  {thread.contexts.map((c) => (
                    <div key={c.source_id}>
                      <FileText size={14} />
                      <span>
                        {c.title}
                        <small>
                          {c.source_location.section_title ?? c.source_id} ·{' '}
                          {c.source_version}
                        </small>
                      </span>
                      <button
                        aria-label={t('openSource')}
                        onClick={() => sourceGo(c.source_id)}
                      >
                        <ArrowUpRight size={15} />
                      </button>
                    </div>
                  ))}
                  <button
                    className="text-button"
                    onClick={() => {
                      const filters = naviSearchConditions(
                        thread.contexts[0],
                        data,
                      );
                      requestCommunitySearch(filters);
                      setOpen(false);
                      navigate('subjects', 'all', 'discover');
                    }}
                  >
                    {t('relatedPacks')}
                  </button>
                </section>
              )}
              {cloudUser &&
                thread?.contexts.some(
                  (c) =>
                    c.context_type === 'pack' &&
                    /^[a-f0-9-]{36}$/i.test(c.source_id),
                ) && (
                  <section className="navi-context">
                    <button
                      className="text-button"
                      disabled={busy || loadingPack}
                      onClick={() => void readPublicQuestions()}
                    >
                      {t('loadQuestions')}
                    </button>
                    {publicPack && (
                      <select
                        aria-label={t('chooseQuestion')}
                        value={
                          thread.contexts.find(
                            (c) => c.context_type === 'question',
                          )?.source_id ?? ''
                        }
                        onChange={(e) => choosePublicQuestion(e.target.value)}
                      >
                        <option value="">{t('chooseQuestion')}</option>
                        {publicPack.questions.map((q, i) => (
                          <option key={q.id} value={q.id}>
                            {i + 1}. {q.prompt.slice(0, 90)}
                          </option>
                        ))}
                      </select>
                    )}
                  </section>
                )}
              <details className="navi-tutor-settings">
                <summary>{t('settings')}</summary>
                <section className="navi-tutor-controls"><label>{t('membership.level')}<select value={membershipMode} onChange={e=>setMembershipMode(e.target.value as any)}><option value="navi_basic">Navi · Free</option><option value="navi_deep">Navi Deep · Plus</option><option value="agent">Navi Agent · Pro</option></select></label><label>{t('membership.trial')}<select value={membershipTrial} onChange={e=>setMembershipTrial(e.target.value as any)}><option value="">{t('membership.noTrial')}</option><option value="plus">{t('membership.plusTrial')}</option><option value="pro">{t('membership.proPreview')}</option></select></label>
                  <label>
                    {t('modeLabel')}
                    <select
                      value={tutorMode}
                      onChange={(e) => setTutorMode(e.target.value)}
                    >
                      {[
                        'auto',
                        'concept',
                        'problem',
                        'writing',
                        'study',
                        'exam',
                      ].map((m) => (
                        <option value={m} key={m}>
                          {t('mode.' + m)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {currentQuestion &&
                    ['auto', 'problem'].includes(tutorMode) && (
                      <div
                        className="navi-help-levels"
                        aria-label={t('helpLabel')}
                      >
                        {[1, 2, 3, 4].map((level) => (
                          <button
                            type="button"
                            aria-pressed={helpLevel === level}
                            onClick={() => setHelpLevel(level)}
                            key={level}
                          >
                            {t('help.' + level)}
                          </button>
                        ))}
                      </div>
                    )}
                  {tutorMode === 'concept' && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setHelpLevel((v) => (v === 4 ? 2 : 4))}
                    >
                      {t(
                        helpLevel === 4
                          ? 'concept.detailed'
                          : 'concept.concise',
                      )}
                    </button>
                  )}
                  {tutorMode === 'writing' && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setDraft(t('writing.prompt'))}
                    >
                      {t('writing.tool')}
                    </button>
                  )}
                  {tutorMode === 'study' && <p>{t('study.tool')}</p>}
                  {tutorMode === 'exam' && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setDraft(t('exam.prompt'))}
                    >
                      {t('exam.tool')}
                    </button>
                  )}
                  <label className="navi-consent">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                    />
                    {t('evidenceConsent')}
                  </label>
                  <small>{t('evidenceScope')}</small>
                  {currentQuestion && (
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => {
                        closeTool();
                        setPractice(true);
                        setMenu(false);
                      }}
                    >
                      {t('practice.title')}
                    </button>
                  )}
                </section>
              </details>
              {courseContext && (
                <button
                  type="button"
                  className="navi-editor-action text-button"
                  onClick={() => {
                    closeTool();
                    setMenu(false);
                    setEditorRequested(true);
                    window.dispatchEvent(
                      new CustomEvent('review:navi-course-editor', {
                        detail: {
                          courseId: courseContext.source_id,
                          sectionId: courseContext.source_location.section_id,
                        },
                      }),
                    );
                  }}
                >
                  {t('editor.title')}
                </button>
              )}

              <label className="navi-auto-consent">
                <input
                  type="checkbox"
                  checked={autoUI}
                  disabled={autoSaving}
                  onChange={(e) => void saveAutoUI(e.target.checked)}
                />
                <span>
                  {t('tool.auto')}
                  <small>{t('tool.autoScope')}</small>
                </span>
              </label>
              <p className="navi-menu-privacy">{t('privacy')}</p>
            </section>
          )}
          <div
            className="navi-messages"
            ref={scroller}
            onScroll={() => {
              const el = scroller.current;
              if (el)
                follow.current =
                  el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            }}
            aria-live="polite"
          >
            {messages.map((m) => {
              const webPreviewMessage = research && m.id === toolMessageId && m.text === t('web.privacy');
              const operationId =
                'navi-config:' + m.id.replace('navi-message:', '');
              const savedConfiguration = m.configuration_actions?.length
                ? findConfigurationReceipt(data, operationId)
                : null;
              return (
                <article key={m.id} className={m.role}>
                  <small>{m.role === 'user' ? t('you') : 'Navi'}</small>
                  {!webPreviewMessage && <div className="navi-message-body">
                    {m.role === 'assistant' ? (
                      <NaviResponse text={m.text} />
                    ) : (
                      <MathText>{m.text}</MathText>
                    )}
                  </div>}
                  {m.supplementary && (
                    <small className="navi-supplement">{t('supplement')}</small>
                  )}
                  {!!m.citations?.length && (
                    <details className="navi-source-details">
                      <summary>
                        {t('source')} · {m.citations.length}
                      </summary>
                      {m.citations.map((c, i) => (
                        <button
                          type="button"
                          className="navi-citation"
                          aria-label={
                            m.external_sources?.find(
                              (s) => s.source_id === c.source_id,
                            )?.title ?? t('source') + ' ' + (i + 1)
                          }
                          key={i}
                          onClick={() =>
                            c.source_id.startsWith('evidence:')
                              ? notify(t('evidenceScope'))
                              : (() => {
                                  const source = m.external_sources?.find(
                                      (s) => s.source_id === c.source_id,
                                    ),
                                    url = source && safeNaviWebURL(source.url);
                                  if (url)
                                    window.open(
                                      url,
                                      '_blank',
                                      'noopener,noreferrer',
                                    );
                                  else sourceGo(c.source_id);
                                })()
                          }
                        >
                          {m.external_sources?.find(
                            (s) => s.source_id === c.source_id,
                          )?.title ?? t('source')}{' '}
                          {i + 1} ·{' '}
                          {m.external_sources?.find(
                            (s) => s.source_id === c.source_id,
                          )
                            ? 'Wikipedia · ' + c.source_version
                            : t('source')}
                          <blockquote>{c.quote}</blockquote>
                        </button>
                      ))}
                    </details>
                  )}
                  {m.role === 'assistant' && !webPreviewMessage && (
                    <div className="navi-message-actions">
                      <button
                        type="button"
                        className="navi-save-note"
                        title={t('saveNote')}
                        aria-label={t('saveNote')}
                        onClick={() => {
                          closeTool();
                          setPendingNote(m);
                        }}
                      >
                        <BookmarkPlus size={17} />
                      </button>
                      {!!m.ui_actions?.length && (
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => {
                            closeTool();
                            setPendingUI(m);
                          }}
                        >
                          {t('tool.view')}
                        </button>
                      )}
                      {m.configuration_actions?.[0] && !savedConfiguration && (
                        <button
                          type="button"
                          onClick={() => {
                            closeTool();
                            setConfiguration({
                              action: m.configuration_actions![0],
                              id: m.id,
                            });
                          }}
                        >
                          {t('config.review')}
                        </button>
                      )}
                      {m.tutor_actions?.map((a, i) => (
                        <button
                          type="button"
                          className="text-button"
                          key={i}
                          onClick={() => openAction(a)}
                        >
                          {t('action.' + a.type)}
                        </button>
                      ))}
                    </div>
                  )}
                  {savedConfiguration && (
                    <NaviConfigurationReceipt receipt={savedConfiguration} />
                  )}
                  {m.understanding_check && (
                    <NaviUnderstandingCheck
                      key={m.id}
                      question={m.understanding_check.question}
                      busy={busy || !aiReady}
                      answered={messages.some(
                        (other) =>
                          other.role === 'assistant' &&
                          other.checkResponseTo === m.id,
                      )}
                      onAnswer={(answer) =>
                        void send(
                          t('check.response') +
                            '\n' +
                            m.understanding_check!.question +
                            '\n\n' +
                            answer,
                          {
                            phase: 'review',
                            question: m.understanding_check!.question,
                            answer,
                          },
                          m.id,
                        )
                      }
                    />
                  )}
                  {m.role === 'assistant' && m.id === messages.at(-1)?.id && canSuggestFollowups && (
                    <nav className="navi-followups" aria-label={t('followup.title')}>
                      <button type="button" onClick={() => void send(t('check.request'), { phase: 'ask' })}>
                        {t('check.start')}
                      </button>
                      {['rephrase', 'example'].map(kind => (
                        <button type="button" key={kind} onClick={() => void send(t('followup.' + kind + '.request'))}>
                          {t('followup.' + kind)}
                        </button>
                      ))}
                    </nav>
                  )}
                  {m.id === toolMessageId && !savedConfiguration && inlineTool}
                </article>
              );
            })}
            {!toolMessageId && inlineTool}
            {busy && (
              <NaviActivity
                label={requestPending ? t('thinking') : t('activity.reading')}
                state={avatarState}
              />
            )}
            {error && (
              <div role="alert" className="settings-error">
                <p>{error}</p>
                {diagnostic&&<NaviErrorDetails key={diagnostic.requestId} diagnostic={diagnostic}/>}
                <button
                  type="button"
                  onClick={() => {
                    closeTool();
                    setResearch(true);
                  }}
                >
                  {t('web.title')}
                </button>
              </div>
            )}
          </div>
          {receipt && (
            <div className="navi-receipt" role="status">
              <span>{receipt}</span>
              <button
                type="button"
                aria-label={t('live.undo')}
                onClick={() => {
                  const result = executeNaviUI([
                    { type: 'restoreLayout', target: 'undo' },
                  ]);
                  showOutcome(result.ok ? 'success' : 'error');
                  setReceipt(
                    result.ok
                      ? t('live.restored')
                      : t('live.error.' + result.reason),
                  );
                }}
              >
                {t('live.undo')}
              </button>
              <button
                type="button"
                aria-label={t('tool.dismiss')}
                onClick={() => setReceipt('')}
              >
                <X size={13} />
              </button>
            </div>
          )}
          <form
            className="navi-composer"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            {thread?.contexts.some((c) => c.selected_text) && (
              <div className="navi-selected-quote">
                <details>
                  <summary>
                    {t('selection.quoted')} ·{' '}
                    {thread.contexts
                      .find((c) => c.selected_text)!
                      .selected_text.slice(0, 70)}
                  </summary>
                  <blockquote>
                    {
                      thread.contexts.find((c) => c.selected_text)!
                        .selected_text
                    }
                  </blockquote>
                </details>
                <button
                  type="button"
                  aria-label={t('selection.clear')}
                  onClick={() =>
                    setThread({
                      ...thread,
                      contexts: thread.contexts.map((c) => ({
                        ...c,
                        selected_text: '',
                      })),
                    })
                  }
                >
                  <X size={14} />
                </button>
              </div>
            )}
            <div className="navi-compose-row">
              <button className="navi-compose-avatar" type="button" aria-label={t('close')} onClick={() => {
                setOpen(false);
                controller.current?.abort();
              }}>
                <NaviAvatar size={96} state={avatarState} label={null} replayKey={motionRun}
                  target={avatarState === 'guiding' ? { x: 0.35, y: 1 } : null} />
              </button>
            <div className="navi-input-shell">
              <textarea
                ref={field}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={2500}
                rows={1}
                aria-label={t('message')}
                placeholder={t('message')}
                disabled={busy}
              />
              {busy ? (
                <button
                  type="button"
                  className="navi-send navi-stop"
                  aria-label={t('activity.stop')}
                  onClick={() => controller.current?.abort()}
                >
                  <Square size={14} fill="currentColor" />
                </button>
              ) : draftNeedsConnection ? (
                <button type="button" className="navi-send" aria-label={t('connect')}
                  title={t('connect')} onClick={openConnectionSettings}>
                  <Plug size={18} />
                </button>
              ) : (
                <button
                  type="submit"
                  className="navi-send"
                  aria-label={t('send')}
                  disabled={!draft.trim()}
                >
                  <ArrowUp size={19} />
                </button>
              )}
            </div>
            </div>
          </form>
        </NaviSurface>
      )}
    </NaviLayer>
  );
}
