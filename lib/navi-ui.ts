import { z } from 'zod';

export const workspaceModes = [
  'default',
  'focus',
  'comparison',
  'solution-split',
  'question-comparison',
  'knowledge-comparison',
  'derivation',
  'evidence',
  'board',
] as const;
export const panelNames = [
  'question',
  'explanation',
  'diagram',
  'steps',
  'rubric',
  'answer',
  'source',
  'notes',
  'knowledge',
  'content',
  'formula',
  'material',
  'comparison',
] as const;
const panel = z.enum(panelNames),
  id = z.string().min(1).max(200);
export const workspaceLayoutSchema = z
  .object({
    mode: z.enum(workspaceModes),
    panels: z.array(panel).max(13),
    width: z.number().min(25).max(75),
    zoom: z.number().min(0.75).max(2),
    fontSize: z.number().int().min(14).max(26),
    visibleSteps: z.number().int().min(1).max(50),
    questionId: id.optional(),
    molecule: z.enum(['ball-stick', 'spacefill', 'surface']).optional(),
    columns: z.number().int().min(1).max(3).default(1),
    cells: z
      .partialRecord(
        panel,
        z
          .object({
            span: z.number().int().min(1).max(3),
            height: z.number().int().min(180).max(900),
          })
          .strict(),
      )
      .default({}),
    knowledgeIds: z.array(id).max(2).optional(),
  })
  .strict();
/** An intentionally finite protocol. Neither selectors nor executable code are accepted. */
export const naviUIAction = z.discriminatedUnion('type', [
  z
    .object({ type: z.literal('setLayout'), mode: z.enum(workspaceModes) })
    .strict(),
  z
    .object({ type: z.literal('splitView'), questionId: id.optional() })
    .strict(),
  z
    .object({ type: z.literal('compareKnowledge'), ids: z.array(id).length(2) })
    .strict(),
  z
    .object({
      type: z.literal('setGrid'),
      columns: z.number().int().min(1).max(3),
    })
    .strict(),
  z
    .object({
      type: z.literal('resizeComponent'),
      panel,
      span: z.number().int().min(1).max(3),
      height: z.number().int().min(180).max(900),
    })
    .strict(),
  z
    .object({
      type: z.literal('restoreWorkspace'),
      layout: workspaceLayoutSchema,
    })
    .strict(),
  z.object({ type: z.literal('setFocusMode'), enabled: z.boolean() }).strict(),
  z
    .object({
      type: z.literal('resizePanel'),
      panel,
      percent: z.number().min(25).max(75),
    })
    .strict(),
  z.object({ type: z.literal('collapsePanel'), panel }).strict(),
  z.object({ type: z.literal('expandPanel'), panel }).strict(),
  z
    .object({ type: z.literal('setZoom'), value: z.number().min(0.75).max(2) })
    .strict(),
  z
    .object({
      type: z.literal('setFontSize'),
      value: z.number().int().min(14).max(26),
    })
    .strict(),
  z.object({ type: z.literal('expandAnswer') }).strict(),
  z.object({ type: z.literal('collapseAnswer') }).strict(),
  z.object({ type: z.literal('showExplanation') }).strict(),
  z
    .object({ type: z.literal('toggleSourcePanel'), visible: z.boolean() })
    .strict(),
  z
    .object({ type: z.literal('mountRegisteredComponent'), component: panel })
    .strict(),
  z
    .object({ type: z.literal('removeRegisteredComponent'), component: panel })
    .strict(),
  z
    .object({
      type: z.literal('arrangeComponents'),
      panels: z.array(panel).min(1).max(13),
    })
    .strict(),
  z
    .object({
      type: z.literal('configureComponent'),
      component: z.enum(['steps', 'molecule']),
      visibleSteps: z.number().int().min(1).max(50).optional(),
      model: z.enum(['ball-stick', 'spacefill', 'surface']).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('restoreLayout'),
      target: z.enum(['undo', 'default', 'previous']),
    })
    .strict(),
]);
export type NaviUIAction = z.infer<typeof naviUIAction>;
export type WorkspaceLayout = z.infer<typeof workspaceLayoutSchema>;
export const defaultLayout = (): WorkspaceLayout => ({
  mode: 'default',
  panels: [],
  width: 50,
  zoom: 1,
  fontSize: 18,
  visibleSteps: 1,
  columns: 1,
  cells: {},
});
export type UICapabilities = {
  panels: readonly string[];
  questionIds: readonly string[];
  molecule: boolean;
  protected: boolean;
  knowledgeIds?: readonly string[];
  splitPanel?: (typeof panelNames)[number];
};
export type UIReceipt = {
  ok: boolean;
  reason?: 'unsupported' | 'protected' | 'invalid' | 'manual' | 'empty';
  count: number;
};
const layouts: Record<WorkspaceLayout['mode'], WorkspaceLayout['panels']> = {
  default: [],
  focus: [],
  comparison: ['explanation'],
  'solution-split': ['explanation'],
  'question-comparison': ['comparison'],
  'knowledge-comparison': ['comparison'],
  derivation: ['steps'],
  evidence: ['answer', 'explanation', 'rubric'],
  board: ['knowledge', 'notes', 'source'],
};

/** Prepare a whole batch before committing. A rejected last action changes nothing. */
export function reduceNaviUI(
  current: WorkspaceLayout,
  input: unknown,
  cap: UICapabilities,
): WorkspaceLayout {
  const actions = z.array(naviUIAction).min(1).max(12).parse(input);
  if (cap.protected) throw new Error('protected');
  let next: WorkspaceLayout = structuredClone(current);
  const requirePanel = (p: string) => {
    if (!cap.panels.includes(p)) throw new Error('unsupported');
  };
  for (const a of actions) {
    if (a.type === 'restoreLayout') {
      if (a.target !== 'default') throw new Error('unsupported');
      next = defaultLayout();
    } else if (a.type === 'restoreWorkspace') {
      const saved = a.layout;
      for (const p of saved.panels) requirePanel(p);
      if (
        (saved.questionId && !cap.questionIds.includes(saved.questionId)) ||
        saved.knowledgeIds?.some((id) => !cap.knowledgeIds?.includes(id)) ||
        (saved.molecule && !cap.molecule)
      )
        throw new Error('unsupported');
      if (new Set(saved.panels).size !== saved.panels.length)
        throw new Error('invalid');
      next = structuredClone(saved);
    } else if (a.type === 'setGrid') next.columns = a.columns;
    else if (a.type === 'resizeComponent') {
      requirePanel(a.panel);
      next.cells[a.panel] = { span: a.span, height: a.height };
    } else if (a.type === 'compareKnowledge') {
      requirePanel('comparison');
      if (
        new Set(a.ids).size !== 2 ||
        a.ids.some((id) => !cap.knowledgeIds?.includes(id))
      )
        throw new Error('unsupported');
      next = {
        ...next,
        mode: 'knowledge-comparison',
        panels: ['comparison'],
        knowledgeIds: a.ids,
      };
    } else if (a.type === 'setLayout') {
      const panels = layouts[a.mode].filter(
        (p) => a.mode !== 'board' || cap.panels.includes(p),
      );
      for (const p of panels) requirePanel(p);
      next = { ...next, mode: a.mode, panels: [...panels] };
    } else if (a.type === 'splitView') {
      const p = a.questionId ? 'comparison' : (cap.splitPanel ?? 'explanation');
      requirePanel(p);
      if (a.questionId && !cap.questionIds.includes(a.questionId))
        throw new Error('unsupported');
      next = {
        ...next,
        mode: a.questionId ? 'question-comparison' : 'comparison',
        panels: [p],
        questionId: a.questionId,
      };
    } else if (a.type === 'setFocusMode')
      next = { ...next, mode: a.enabled ? 'focus' : 'default', panels: [] };
    else if (a.type === 'resizePanel') {
      requirePanel(a.panel);
      next.width = a.percent;
    } else if (a.type === 'setZoom') {
      requirePanel('diagram');
      next.zoom = a.value;
    } else if (a.type === 'setFontSize') next.fontSize = a.value;
    else if (a.type === 'arrangeComponents') {
      for (const p of a.panels) requirePanel(p);
      if (new Set(a.panels).size !== a.panels.length)
        throw new Error('invalid');
      next.panels = [...a.panels];
      next.mode = 'board';
    } else if (a.type === 'configureComponent') {
      if (a.component === 'steps') {
        requirePanel('steps');
        if (!a.visibleSteps || a.model) throw new Error('invalid');
        next.visibleSteps = a.visibleSteps;
      } else {
        if (!cap.molecule) throw new Error('unsupported');
        if (!a.model || a.visibleSteps) throw new Error('invalid');
        next.molecule = a.model;
      }
    } else {
      const p =
        'panel' in a
          ? a.panel
          : 'component' in a
            ? a.component
            : a.type === 'toggleSourcePanel'
              ? 'source'
              : a.type === 'showExplanation'
                ? 'explanation'
                : 'answer';
      requirePanel(p);
      const remove =
        a.type === 'collapsePanel' ||
        a.type === 'removeRegisteredComponent' ||
        a.type === 'collapseAnswer' ||
        (a.type === 'toggleSourcePanel' && !a.visible);
      next.panels = remove
        ? next.panels.filter((v) => v !== p)
        : [...new Set([...next.panels, p])];
      if (next.mode === 'default' && next.panels.length) next.mode = 'board';
    }
  }
  return next;
}

export class NaviUIController {
  state = defaultLayout();
  history: WorkspaceLayout[] = [];
  private listeners = new Set<() => void>();
  manualAt = 0;
  readEvidence?: () => {
    questionId: string;
    answer: string;
    grade?: unknown;
    steps?: unknown;
  };
  assistance?: (level: 1 | 2 | 3 | 4) => void;
  target?: {
    type: 'question' | 'course' | 'material' | 'pack' | 'plan' | 'subject';
    id: string;
    sectionId?: string;
  };
  constructor(public capabilities: UICapabilities) {}
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  snapshot = () => this.state;
  private commit(next: WorkspaceLayout) {
    this.history = [...this.history.slice(-19), this.state];
    this.state = next;
    this.listeners.forEach((fn) => fn());
  }
  execute(
    input: unknown,
    origin: 'user' | 'suggestion' | 'command' = 'command',
  ): UIReceipt {
    if (origin === 'suggestion' && this.manualAt)
      return { ok: false, reason: 'manual', count: 0 };
    try {
      const actions = z.array(naviUIAction).min(1).max(12).parse(input);
      if (this.capabilities.protected)
        return { ok: false, reason: 'protected', count: 0 };
      if (
        actions.some(
          (a) => a.type === 'restoreLayout' && a.target !== 'default',
        )
      ) {
        if (actions.length !== 1)
          return { ok: false, reason: 'invalid', count: 0 };
        if (!this.history.length)
          return { ok: false, reason: 'empty', count: 0 };
        this.state = this.history[this.history.length - 1];
        this.history = this.history.slice(0, -1);
        this.listeners.forEach((fn) => fn());
      } else this.commit(reduceNaviUI(this.state, actions, this.capabilities));
      if (this.state.panels.includes('explanation')) this.assistance?.(4);
      else if (this.state.panels.includes('steps')) this.assistance?.(3);
      if (origin === 'user') this.manualAt = Date.now();
      return { ok: true, count: actions.length };
    } catch (e) {
      return {
        ok: false,
        reason:
          e instanceof Error && e.message === 'unsupported'
            ? 'unsupported'
            : 'invalid',
        count: 0,
      };
    }
  }
}

// Mounted page controllers share one bridge; nested readers can be explicitly activated.
const controllers = new Map<
  NaviUIController,
  { priority: number; order: number }
>();
let order = 0;
export function registerNaviUI(controller: NaviUIController, priority = 10) {
  controllers.set(controller, { priority, order: ++order });
  return () => {
    controllers.delete(controller);
  };
}
export function activateNaviUI(controller: NaviUIController) {
  if (controllers.has(controller))
    controllers.set(controller, { priority: 100, order: ++order });
}
export function focusNaviTarget(target: { id: string }) {
  const found = [...controllers.keys()].find((c) => c.target?.id === target.id);
  if (found) activateNaviUI(found);
}
export function currentNaviUI() {
  return [...controllers].sort(
    (a, b) => b[1].priority - a[1].priority || b[1].order - a[1].order,
  )[0]?.[0];
}
export function executeNaviUI(input: unknown) {
  return (
    currentNaviUI()?.execute(input) ??
    ({ ok: false, reason: 'unsupported', count: 0 } as UIReceipt)
  );
}

/** Auto permission covers reversible presentation only, never answer disclosure or data writes. */
export function canAutoApplyNaviUI(
  input: unknown,
  cap: UICapabilities,
): boolean {
  const parsed = z.array(naviUIAction).min(1).max(12).safeParse(input);
  if (!parsed.success || cap.protected) return false;
  return parsed.data.every((a) => {
    if (
      [
        'setZoom',
        'setFontSize',
        'setGrid',
        'resizePanel',
        'resizeComponent',
        'collapsePanel',
        'removeRegisteredComponent',
        'collapseAnswer',
        'setFocusMode',
        'restoreLayout',
      ].includes(a.type)
    )
      return true;
    if (a.type === 'setLayout') return ['default', 'focus'].includes(a.mode);
    if (a.type === 'toggleSourcePanel') return true;
    if (a.type === 'splitView')
      return !!a.questionId || cap.splitPanel === 'notes';
    if (a.type === 'expandPanel' || a.type === 'mountRegisteredComponent')
      return [
        'source',
        'notes',
        'knowledge',
        'diagram',
        'material',
        'question',
        'content',
      ].includes('panel' in a ? a.panel : a.component);
    return false;
  });
}

/** Explicit requests open a confirmation tool. They do not generate or persist anything. */
export function parseNaviToolIntent(
  text: string,
): 'practice' | 'course-editor' | 'save-note' | undefined {
  const value = text.trim();
  if (
    /^(?:请|請|帮我|幫我|给我|給我|please\s+)?(?:保存|儲存|save).*(?:笔记|筆記|notes?)/i.test(
      value,
    )
  )
    return 'save-note';
  if (
    /^(?:请|請|帮我|幫我|给我|給我|please\s+)?(?:生成|出|来|來|create|generate|make)\s*(?:一[道题題]|a\s+)?(?:变式|變式|类似|類似|similar|analogous|practice)/i.test(
      value,
    )
  )
    return 'practice';
  if (
    /^(?:请|請|帮我|幫我|给我|給我|please\s+)?(?:打开|開啟|open|edit|修改|编辑|編輯)\s*(?:课程编辑器|課程編輯器|课件|課件|课程|課程|course\s+editor|course)/i.test(
      value,
    )
  )
    return 'course-editor';
}

/** Local commands work without an AI request. Unrecognized language goes to the tutor. */
export function parseNaviUICommand(text: string): NaviUIAction[] | null {
  const s = text.trim().toLowerCase();
  if (
    /不要|別|别|不想|don.t|do not|ne .*pas|no quiero|しない|말고|하지 마|не надо|什么是|什麼是|what is|how does|是什么意思|是什麼意思/.test(
      s,
    )
  )
    return null;
  if (
    /^(撤销|undo|元に戻す|실행 취소|annuler|deshacer|отменить)[。.!！]?$/.test(
      s,
    )
  )
    return [{ type: 'restoreLayout', target: 'undo' }];
  if (
    /恢复默认|默认界面|reset.*layout|restore.*default|rétablir.*défaut|restablecer|標準.*戻|기본.*복원|сброс.*макет/.test(
      s,
    )
  )
    return [{ type: 'restoreLayout', target: 'default' }];
  if (/恢复刚才|previous layout|布局撤销/.test(s))
    return [{ type: 'restoreLayout', target: 'previous' }];
  if (
    /专注模式|專注模式|focus mode|集中モード|집중 모드|mode concentration|modo concentración|режим фокуса/.test(
      s,
    )
  )
    return [{ type: 'setFocusMode', enabled: true }];
  if (
    /左右并排|左右並排|左右两[侧边]|左右兩[側邊]|side.by.side|split view|côte à côte|lado a lado|並べて|나란히|рядом/.test(
      s,
    )
  )
    return [{ type: 'splitView' }];
  if (
    /(放大|zoom in|agrandir|拡大|확대|ampliar|увеличить).*(图|圖|diagram|graph|光路|坐标|座標|figure|図|그림|gráfico|схем)/.test(
      s,
    )
  )
    return [{ type: 'setZoom', value: 1.5 }];
  if (
    /空间填充|空間填充|space.fill|espace rempli|relleno espacial|空間充填|공간 충전|пространствен/.test(
      s,
    )
  )
    return [
      { type: 'configureComponent', component: 'molecule', model: 'spacefill' },
    ];
  if (
    /球棍|ball.and.stick|ball-stick|boules et bâtonnets|bolas y varillas|球棒|막대 모형|шаростержнев/.test(
      s,
    )
  )
    return [
      {
        type: 'configureComponent',
        component: 'molecule',
        model: 'ball-stick',
      },
    ];
  if (/隐藏笔记|隱藏筆記|hide notes/.test(s))
    return [{ type: 'collapsePanel', panel: 'notes' }];
  if (
    /(公式|equation|formula).*(图|圖|graph|坐标).*(一起|并排|並排|together)/.test(
      s,
    )
  )
    return [
      { type: 'arrangeComponents', panels: ['formula', 'diagram'] },
      { type: 'setGrid', columns: 2 },
    ];
  if (
    /展开.*推导|展開.*推導|show.*derivation|dérivation|derivación|導出|유도.*펼|вывод/.test(
      s,
    )
  )
    return [
      { type: 'setLayout', mode: 'derivation' },
      { type: 'configureComponent', component: 'steps', visibleSteps: 50 },
    ];
  return null;
}
