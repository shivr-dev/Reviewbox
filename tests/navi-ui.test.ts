import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NaviUIController,
  canAutoApplyNaviUI,
  parseNaviToolIntent,
  parseNaviUICommand,
  isNaviPageEditRequest,
  isNaviDiagramRequest,
  prepareNaviUIProposal,
  defaultLayout,
  workspaceLayoutSchema,
  registerNaviUI,
  activateNaviUI,
  currentNaviUI,
} from '../lib/navi-ui';
import { relatedNaviEvidence } from '../lib/navi-evidence';
import { naviQuestionSketch } from '../lib/navi-question-visual';
import type { Question } from '../lib/model';
import { changeNaviLocalPlugin, isReusableNaviRecipe, listNaviLocalPlugins, registerNaviPluginSurface, saveNaviLocalPlugin } from '../lib/navi-local-plugins';
const cap = {
  panels: ['question', 'explanation', 'steps', 'diagram', 'answer', 'rubric'],
  questionIds: ['q1', 'q2'],
  molecule: false,
  protected: false,
};
test('UI commands update, undo and reset actual controller state', () => {
  const c = new NaviUIController(cap);
  assert.equal(
    c.execute(parseNaviUICommand('把题目和解析左右并排。')).ok,
    true,
  );
  assert.equal(c.state.mode, 'comparison');
  assert.deepEqual(c.state.panels, ['explanation']);
  assert.equal(c.execute([{ type: 'setZoom', value: 1.5 }]).ok, true);
  assert.equal(c.state.zoom, 1.5);
  c.execute([{ type: 'restoreLayout', target: 'undo' }]);
  assert.equal(c.state.zoom, 1);
  c.execute([{ type: 'restoreLayout', target: 'default' }]);
  assert.equal(c.state.mode, 'default');
});
test('clear font requests resolve locally and unsupported collection edits leave state intact', () => {
  assert.deepEqual(parseNaviUICommand('把当前页面的字号调到22px'), [{ type: 'setFontSize', value: 22 }]);
  assert.deepEqual(parseNaviUICommand('把字号调大一点', 24), [{ type: 'setFontSize', value: 26 }]);
  assert.equal(parseNaviUICommand('不要把字号调大一点', 24), null);
  assert.equal(isNaviPageEditRequest('帮我重新设计当前页面的布局'), true);
  assert.equal(isNaviPageEditRequest('帮我证明这个方程'), false);
  const collection = new NaviUIController({ ...cap, panels: [], collection: true });
  const previous = collection.snapshot();
  assert.equal(collection.execute([{ type: 'setFontSize', value: 22 }]).reason, 'unsupported');
  assert.equal(collection.snapshot(), previous);
});
test('Navi previews a motion sketch from the visible question without deriving its answer', () => {
  const question = { subject: 'physics', prompt: '一辆自行车 30 s 行驶 150 m，其速度为 ____ m/s。', answer: 'SECRET' } as Question;
  assert.equal(isNaviDiagramRequest('改一下界面，给我个图'), true);
  assert.equal(isNaviDiagramRequest('不要画图'), false);
  const diagram = naviQuestionSketch(question);
  assert.equal(diagram && 'kind' in diagram && diagram.kind, 'motion');
  assert.match(JSON.stringify(diagram), /30 s · 150 m/);
  assert.doesNotMatch(JSON.stringify(diagram), /SECRET|velocity-time/);
  assert.equal(naviQuestionSketch({ ...question, prompt: '从原地跑了 100 m 后折返 30 s' }), undefined);
});
test('Navi proposes only supported changes and keeps protected pages uneditable', () => {
  const surface = new NaviUIController({ ...cap, panels: [], pagePresentation: true });
  assert.deepEqual(prepareNaviUIProposal(surface, [
    { type: 'splitView' }, { type: 'setFontSize', value: 22 },
  ]), [{ type: 'setFontSize', value: 22 }]);
  assert.equal(surface.state.fontSize, 18);
  surface.capabilities.protected = true;
  assert.deepEqual(prepareNaviUIProposal(surface, [{ type: 'setFontSize', value: 22 }]), []);
});
test('local Navi plugins replay after remount on matching surfaces and can be disabled', () => {
  const stored = new Map<string, string>();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
  } });
  const registrations: Array<() => void> = [];
  try {
    const actions = parseNaviUICommand('做个插件：把字号调到22px')!;
    const first = new NaviUIController(cap);
    registrations.push(registerNaviPluginSurface(first, 'practice:math'));
    const baseline = first.snapshot();
    assert.equal(first.execute(actions).ok, true);
    assert.equal(saveNaviLocalPlugin(first, 'Large text', actions, baseline), true);
    assert.equal(isReusableNaviRecipe([{ type: 'expandAnswer' }]), false);
    const reopened = new NaviUIController(cap);
    const other = new NaviUIController(cap);
    const protectedRoom = new NaviUIController({ ...cap, protected: true });
    registrations.push(registerNaviPluginSurface(reopened, 'practice:math'));
    registrations.push(registerNaviPluginSurface(other, 'practice:english'));
    registrations.push(registerNaviPluginSurface(protectedRoom, 'practice:math'));
    assert.equal(reopened.snapshot().fontSize, 22);
    assert.equal(other.snapshot().fontSize, 18);
    assert.equal(protectedRoom.snapshot().fontSize, 18);
    assert.equal(changeNaviLocalPlugin(listNaviLocalPlugins()[0].id, 'disable', reopened), true);
    assert.equal(reopened.snapshot().fontSize, 18);
    assert.equal(listNaviLocalPlugins()[0].enabled, false);
  } finally {
    registrations.forEach(unregister => unregister());
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
test('invalid final step rolls back the whole batch, including malicious or unsupported parameters', () => {
  const c = new NaviUIController(cap);
  for (const invalid of [
    { type: 'setZoom', value: 99 },
    { type: 'executeJavaScript', code: 'alert(1)' },
    { type: 'splitView', questionId: 'other-account' },
    { type: 'configureComponent', component: 'molecule', model: 'surface' },
  ]) {
    const before = c.snapshot();
    assert.equal(
      c.execute([{ type: 'setFocusMode', enabled: true }, invalid]).ok,
      false,
    );
    assert.equal(c.snapshot(), before);
    assert.equal(c.history.length, 0);
  }
});
test('formal assessment and manual layout preferences are protected', () => {
  const c = new NaviUIController({ ...cap, protected: true });
  assert.equal(
    c.execute([{ type: 'setFocusMode', enabled: true }]).reason,
    'protected',
  );
  const manual = new NaviUIController(cap);
  manual.execute([{ type: 'setFocusMode', enabled: true }], 'user');
  assert.equal(
    manual.execute([{ type: 'setLayout', mode: 'default' }], 'suggestion')
      .reason,
    'manual',
  );
  assert.equal(manual.state.mode, 'focus');
});
test('private evidence is opt-in, related, bounded and never includes image or unrelated history', () => {
  const contexts: any = [
      { source_id: 'q1', related_question_ids: ['q1'], knowledge_refs: ['n1'] },
    ],
    data: any = {
      questions: [{ id: 'q1', subject: 'math' }],
      events: [
        {
          id: 'related',
          questionId: 'q1',
          nodeId: 'n1',
          occurredAt: '2026-11-08',
          answer: 'my answer',
        },
        {
          id: 'unrelated',
          questionId: 'q-private',
          nodeId: 'n-private',
          occurredAt: '2026-11-08',
          answer: 'do not share',
        },
      ],
      jobs: [
        {
          kind: 'process-draft',
          questionId: 'q1',
          text: 'step one',
          image: 'private image data',
        },
      ],
      exams: [],
    };
  assert.equal(relatedNaviEvidence(data, contexts, false), undefined);
  const result = relatedNaviEvidence(data, contexts, true)!;
  assert.match(result.relevant_content, /my answer/);
  assert.match(result.relevant_content, /step one/);
  assert.doesNotMatch(
    result.relevant_content,
    /do not share|private image data/,
  );
  assert.ok(result.relevant_content.length <= 12000);
});
test('derivation works without a diagram and comparison distinguishes two questions', () => {
  const c = new NaviUIController({
    ...cap,
    panels: ['steps', 'comparison', 'explanation'],
  });
  assert.equal(c.execute([{ type: 'setLayout', mode: 'derivation' }]).ok, true);
  assert.deepEqual(c.state.panels, ['steps']);
  assert.equal(c.execute([{ type: 'splitView', questionId: 'q2' }]).ok, true);
  assert.equal(c.state.mode, 'question-comparison');
  assert.deepEqual(c.state.panels, ['comparison']);
  assert.equal(c.state.questionId, 'q2');
});
test('full validated workspace restoration includes dimensions, steps, comparison and molecule state', () => {
  const c = new NaviUIController({
    ...cap,
    panels: [...cap.panels, 'comparison'],
    molecule: true,
  });
  const saved = workspaceLayoutSchema.parse({
    ...defaultLayout(),
    mode: 'board',
    panels: ['steps', 'comparison'],
    width: 67,
    visibleSteps: 7,
    questionId: 'q2',
    molecule: 'spacefill',
    columns: 3,
    cells: { steps: { span: 2, height: 600 } },
  });
  assert.equal(
    c.execute([{ type: 'restoreWorkspace', layout: saved }]).ok,
    true,
  );
  assert.deepEqual(c.state, saved);
  const before = c.snapshot();
  assert.equal(
    c.execute([
      {
        type: 'restoreWorkspace',
        layout: { ...saved, questionId: 'other-account' },
      },
    ]).ok,
    false,
  );
  assert.equal(c.snapshot(), before);
  const old: any = { ...defaultLayout() };
  delete old.columns;
  delete old.cells;
  assert.equal(workspaceLayoutSchema.parse(old).columns, 1);
});
test('global controllers activate the relevant reader and fall back safely on unmount', () => {
  const page = new NaviUIController(cap),
    reader = new NaviUIController({
      ...cap,
      splitPanel: 'notes',
      panels: ['notes', 'source'],
    });
  const removePage = registerNaviUI(page, 10),
    removeReader = registerNaviUI(reader, 0);
  try {
    assert.equal(currentNaviUI(), page);
    activateNaviUI(reader);
    assert.equal(currentNaviUI(), reader);
    assert.equal(reader.execute([{ type: 'splitView' }]).ok, true);
    assert.deepEqual(reader.state.panels, ['notes']);
    removeReader();
    assert.equal(currentNaviUI(), page);
  } finally {
    removeReader();
    removePage();
  }
});

test('automatic permission never authorizes answer disclosure, invalid batches, protected assessment or data operations', () => {
  assert.equal(
    canAutoApplyNaviUI([{ type: 'setZoom', value: 1.5 }], cap),
    true,
  );
  assert.equal(
    canAutoApplyNaviUI([{ type: 'setLayout', mode: 'evidence' }], cap),
    false,
  );
  assert.equal(canAutoApplyNaviUI([{ type: 'expandAnswer' }], cap), false);
  assert.equal(canAutoApplyNaviUI([{ type: 'splitView' }], cap), false);
  assert.equal(
    canAutoApplyNaviUI([{ type: 'splitView' }], {
      ...cap,
      splitPanel: 'notes',
    }),
    true,
  );
  assert.equal(
    canAutoApplyNaviUI([{ type: 'setZoom', value: 1.5 }], {
      ...cap,
      protected: true,
    }),
    false,
  );
  assert.equal(
    canAutoApplyNaviUI(
      [
        { type: 'setZoom', value: 1.5 },
        { type: 'deleteRecord', id: 'q1' },
      ],
      cap,
    ),
    false,
  );
});
test('explicit tool requests only identify an existing review flow and negation does not change the UI', () => {
  assert.equal(parseNaviToolIntent('生成一道类似练习'), 'practice');
  assert.equal(parseNaviToolIntent('打开课程编辑器'), 'course-editor');
  assert.equal(parseNaviToolIntent('保存到笔记'), 'save-note');
  assert.equal(parseNaviToolIntent('不要生成变式'), undefined);
  assert.equal(parseNaviUICommand('不要切换专注模式'), null);
  assert.equal(parseNaviUICommand('什么是专注模式？'), null);
});

test('Live UI collection, exact targets and science controls are atomic and reversible',()=>{
 const c=new NaviUIController({...cap,collection:true,scrollTargets:['material:m1','question:q2'],scientificIds:['force:G','function:0'],macromolecule:true});
 assert.equal(c.execute([{type:'setFilter',query:'momentum',subject:'physics'},{type:'setSort',value:'name'},{type:'scrollToTarget',id:'material:m1'},{type:'highlightTarget',ids:['force:G']},{type:'setMacromolecule',model:'surface'},{type:'setCamera',command:'zoom-in'}]).ok,true);
 assert.equal(c.state.collection?.query,'');assert.equal(c.state.collectionFocus,'material:m1');assert.equal(c.state.collection?.sort,'name');assert.equal(c.state.scroll?.target,'material:m1');assert.deepEqual(c.state.scientific?.highlights,['force:G']);assert.equal(c.state.scientific?.macromolecule,'surface');
 const before=c.snapshot();assert.equal(c.execute([{type:'setSort',value:'new'},{type:'highlightTarget',ids:['solution:hidden']}]).ok,false);assert.equal(c.snapshot(),before);
 assert.equal(c.execute([{type:'restoreLayout',target:'undo'}]).ok,true);assert.equal(c.state.collection,undefined);
 c.capabilities.protected=true;assert.equal(c.execute([{type:'setCamera',command:'reset'}]).ok,false);
});
