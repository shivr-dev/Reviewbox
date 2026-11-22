import { z } from 'zod';
import type { Question } from './model';

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
export const collectionViewSchema=z.object({query:z.string().max(200).default(''),subject:z.enum(['all','chinese','math','english','ce','physics','chemistry','biology','history']).default('all'),sort:z.enum(['new','name']).default('new')}).strict();
export const scientificViewSchema=z.object({highlights:z.array(z.string().min(1).max(200)).max(24).default([]),macromolecule:z.enum(['cartoon','ball-stick','surface']).optional(),camera:z.object({command:z.enum(['reset','zoom-in','zoom-out']),revision:z.number().int().nonnegative()}).optional()}).strict();
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
    collection:collectionViewSchema.optional(),collectionFocus:id.optional(),
    scientific:scientificViewSchema.optional(),
    scroll:z.object({target:id,revision:z.number().int().nonnegative()}).strict().optional(),
  })
  .strict();
/** An intentionally finite protocol. Neither selectors nor executable code are accepted. */
export const naviUIAction = z.discriminatedUnion('type', [
  z.object({type:z.literal('setFilter'),query:z.string().max(200).optional(),subject:collectionViewSchema.shape.subject.optional()}).strict(),
  z.object({type:z.literal('setSort'),value:z.enum(['new','name'])}).strict(),
  z.object({type:z.literal('scrollToTarget'),id}).strict(),
  z.object({type:z.literal('highlightTarget'),ids:z.array(id).min(1).max(24)}).strict(),
  z.object({type:z.literal('clearHighlights')}).strict(),
  z.object({type:z.literal('setMacromolecule'),model:z.enum(['cartoon','ball-stick','surface'])}).strict(),
  z.object({type:z.literal('setCamera'),command:z.enum(['reset','zoom-in','zoom-out'])}).strict(),
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
  collection?:boolean;
  scrollTargets?:readonly string[];
  scientificIds?:readonly string[];
  macromolecule?:boolean;
  /** A page that actually renders reading width and text size from its controller. */
  pagePresentation?: boolean;
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
    const presentation = a.type === 'setFontSize' || a.type === 'setFocusMode' ||
      (a.type === 'setLayout' && (a.mode === 'default' || a.mode === 'focus'));
    if (cap.pagePresentation && !cap.collection && !presentation && a.type !== 'restoreLayout')
      throw new Error('unsupported');
    if (cap.collection && cap.panels.length === 0 &&
      !(cap.pagePresentation && presentation) &&
      !['setFilter', 'setSort', 'scrollToTarget', 'restoreLayout', 'restoreWorkspace', 'highlightTarget',
        'clearHighlights', 'setMacromolecule', 'setCamera'].includes(a.type))
      throw new Error('unsupported');
    if(a.type==='setFilter'||a.type==='setSort') {
      if(!cap.collection)throw new Error('unsupported');
      if(a.type==='setFilter')next.collectionFocus=undefined;
      next.collection=collectionViewSchema.parse({...next.collection,...(a.type==='setSort'?{sort:a.value}:{...(a.query!==undefined?{query:a.query}:{}),...(a.subject!==undefined?{subject:a.subject}:{})})});
    } else if(a.type==='scrollToTarget') {
      if(!cap.scrollTargets?.includes(a.id))throw new Error('unsupported');
      if(cap.collection){next.collection=collectionViewSchema.parse({...next.collection,query:'',subject:'all'});next.collectionFocus=a.id;}
      next.scroll={target:a.id,revision:(next.scroll?.revision??0)+1};
    } else if(a.type==='highlightTarget'||a.type==='clearHighlights') {
      const ids=a.type==='clearHighlights'?[]:a.ids;
      if(!cap.scientificIds||ids.some(id=>!cap.scientificIds!.includes(id)))throw new Error('unsupported');
      next.scientific=scientificViewSchema.parse({...next.scientific,highlights:[...new Set(ids)]});
    } else if(a.type==='setMacromolecule'||a.type==='setCamera') {
      if(!cap.macromolecule)throw new Error('unsupported');
      next.scientific=scientificViewSchema.parse({...next.scientific,...(a.type==='setMacromolecule'?{macromolecule:a.model}:{camera:{command:a.command,revision:(next.scientific?.camera?.revision??0)+1}})});
    } else if (a.type === 'restoreLayout') {
      if (a.target !== 'default') throw new Error('unsupported');
      next = defaultLayout();
    } else if (a.type === 'restoreWorkspace') {
      const saved = a.layout;
      for (const p of saved.panels) requirePanel(p);
      if (
        (saved.questionId && !cap.questionIds.includes(saved.questionId)) ||
        saved.knowledgeIds?.some((id) => !cap.knowledgeIds?.includes(id)) ||
        (saved.molecule && !cap.molecule) || (saved.collection&&!cap.collection) || (saved.collectionFocus&&!cap.scrollTargets?.includes(saved.collectionFocus)) || (saved.scroll&&!cap.scrollTargets?.includes(saved.scroll.target)) || saved.scientific?.highlights.some(id=>!cap.scientificIds?.includes(id)) || ((saved.scientific?.macromolecule||saved.scientific?.camera)&&!cap.macromolecule)
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
  visualQuestion?: Question;
  localPluginScope?: string;
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
        'setFilter','setSort','scrollToTarget','highlightTarget','clearHighlights','setMacromolecule','setCamera',
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

export function isNaviPageEditRequest(text: string) {
  return /(?:编辑|編輯|修改|调整|調整|更改|重排|改一下|改成|换成|換成|优化|優化|重新设计|重新設計|放大|缩小|縮小).{0,18}(?:页面|頁面|界面|版面|排版|布局|佈局|字[号號体體]|面板)|(?:页面|頁面|界面|版面|排版|布局|佈局|字[号號体體]|面板).{0,18}(?:改成|调成|調成|調整|调整|放大|缩小|縮小|变大|變大|变小|變小)|\b(?:edit|adjust|change|redesign|rearrange|resize)\b.{0,36}\b(?:page|layout|font size|panel)\b/i.test(text);
}

export function isNaviPluginRequest(text: string) {
  return /(?:做|创建|建立|搭建|製作|制作|保存|儲存|生成|设计|設計).{0,28}(?:插件|擴充功能|harness)|\b(?:create|build|make|save)\b.{0,32}\b(?:plug-?in|harness)\b/i.test(text);
}

export function isNaviDiagramRequest(text: string) {
  if (/不要|别|別|不用|无需|不需要|do not|don't|without/i.test(text)) return false;
  return /(?:给|給|画|畫|加|生成|打开|打開|显示|顯示|看)(?:我|我看)?\s*(?:一[个個张張幅]|[个個张張])?\s*(?:示意图|示意圖|图示|圖示|图解|圖解|图[。.!！?？\s，,]*$|圖[。.!！?？\s，,]*$)|\b(?:show|add|draw|give me)\b.{0,20}\b(?:diagram|sketch)\b/i.test(text);
}

export function parseNaviPluginRecipe(text: string, fontSize = 18): NaviUIAction[] | null {
  if (!isNaviPluginRequest(text)) return null;
  const instructions = text.replace(/^[^：:\n]{1,36}[：:\n]\s*/, '');
  if (instructions === text) return null;
  const recipe: NaviUIAction[] = [];
  for (const instruction of instructions.split(/[，,；;\n]+/).map(item => item.trim()).filter(Boolean)) {
    if (isNaviDiagramRequest(instruction)) {
      recipe.push({ type: 'mountRegisteredComponent', component: 'diagram' });
      continue;
    }
    const actions = parseNaviUICommand(instruction, fontSize);
    if (!actions) return null;
    recipe.push(...actions);
  }
  return recipe.length && recipe.length <= 12 ? recipe : null;
}

export function prepareNaviUIProposal(controller: NaviUIController, actions: NaviUIAction[]) {
  const current = controller.snapshot(), capabilities = controller.capabilities;
  if (capabilities.protected) return [];
  const [first] = actions;
  if (actions.length === 1 && first.type === 'restoreLayout' && first.target !== 'default')
    return controller.history.length ? actions : [];
  try {
    reduceNaviUI(current, actions, capabilities);
    return actions;
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'unsupported') return [];
  }
  let layout = current;
  const accepted: NaviUIAction[] = [];
  for (const action of actions) {
    if (action.type === 'restoreLayout' && action.target !== 'default') continue;
    const candidate = action.type === 'arrangeComponents'
      ? { ...action, panels: action.panels.filter((panel) => capabilities.panels.includes(panel)) }
      : action;
    if (candidate.type === 'arrangeComponents' && !candidate.panels.length) continue;
    try {
      const next = reduceNaviUI(layout, [candidate], capabilities);
      if (JSON.stringify(next) === JSON.stringify(layout)) continue;
      accepted.push(candidate);
      layout = next;
    } catch {}
  }
  return accepted;
}

/** Local commands work without an AI request. Unrecognized language goes to the tutor. */
export function parseNaviUICommand(text: string, fontSize = 18): NaviUIAction[] | null {
  const input = text.trim();
  const s = (isNaviPluginRequest(input) ? input.replace(/^[^：:\n]{1,36}[：:\n]\s*/, '') : input).toLowerCase();
  if (
    /不要|別|别|不想|don.t|do not|ne .*pas|no quiero|しない|말고|하지 마|не надо|什么是|什麼是|what is|how does|是什么意思|是什麼意思/.test(
      s,
    )
  )
    return null;
  const font = s.match(/^(?:(?:请|請|帮我|幫我|please)\s*)?(?:把\s*|将\s*|將\s*|set\s+|change\s+|调整\s*|調整\s*)?(?:当前页面的?|當前頁面的?|the\s+)?(?:字号|字號|字体大小|字體大小|font size)\s*(?:设为|設為|改成|调到|調到|调成|調成|改为|改為|to|=|[:：])?\s*(\d{2})\s*(?:px)?[。.!！]?$/);
  if (font && +font[1] >= 14 && +font[1] <= 26)
    return [{ type: 'setFontSize', value: Number(font[1]) }];
  const relativeFont = s.match(/^(?:(?:请|請|帮我|幫我)\s*)?(?:把|将|將)?(?:当前页面的?|當前頁面的?)?(?:字号|字號|字体|字體)(?:调|調|改|变|變)?([大小])(?:一?点|一?點|一些)?[。.!！]?$/);
  if (relativeFont)
    return [{ type: 'setFontSize', value: Math.max(14, Math.min(26, fontSize + (relativeFont[1] === '大' ? 2 : -2))) }];
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
    /专注模式|專注模式|阅读模式|閱讀模式|focus mode|reading mode|集中モード|집중 모드|mode concentration|modo concentración|режим фокуса/.test(
      s,
    )
  )
    return [{ type: 'setFocusMode', enabled: true }];
  if (
    /左右并排|左右並排|左右两[侧边]|左右兩[側邊]|题目.{0,8}左边.{0,10}解析.{0,8}右边|題目.{0,8}左邊.{0,10}解析.{0,8}右邊|side.by.side|split view|côte à côte|lado a lado|並べて|나란히|рядом/.test(
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
  if (/^(?:清除高亮|clear highlights)[。.!！]?$/.test(s))return [{type:'clearHighlights'}];
  if (/^(?:按名称排序|sort by name)[。.!！]?$/.test(s))return [{type:'setSort',value:'name'}];
  if (/^(?:按最新排序|sort by newest)[。.!！]?$/.test(s))return [{type:'setSort',value:'new'}];
  const query=s.match(/^(?:筛选资料|搜索资料|search materials)[:： ]+(.+)$/);if(query)return [{type:'setFilter',query:query[1]}];
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
