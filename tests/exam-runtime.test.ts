import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { parseExamPackage } from '../lib/exam-import';
import { nativeExamPackage } from '../lib/exam-native';
test('supplied SAT runtime keeps check-in, directions, review, module transition and finish with durable clock', async () => {
  const item = {
    type: 'mcq',
    prompt: 'Select Yes.',
    choices: ['Yes', 'No'],
    correct: 0,
    explanation: 'Yes is requested.',
  };
  const parsed = await parseExamPackage({
    exam: 'SAT',
    title: 'Runtime fixture',
    flow: [
      {
        id: 'rw1',
        label: 'Reading and Writing',
        durationSeconds: 1920,
        count: 1,
      },
      {
        id: 'rw2',
        label: 'Reading and Writing',
        durationSeconds: 1920,
        count: 1,
      },
    ],
    sectionsInline: { rw1: { questions: [item] }, rw2: { questions: [item] } },
  });
  const pack = nativeExamPackage(parsed.paper, parsed.questions, [], 'Test');
  const elements = new Map<string, any>(),
    listeners: Record<string, Function[]> = {},
    messages: any[] = [],
    timers = new Map<number, Function>(),
    delays: { fn: Function; ms: number }[] = [];
  let now = 100000,
    id = 0;
  const element = (key: string) => {
    if (!elements.has(key))
      elements.set(key, {
        innerHTML: '',
        textContent: '',
        style: {},
        dataset: {},
        classList: {
          add() {},
          remove() {},
          contains() {
            return false;
          },
          toggle() {},
        },
        append() {},
        appendChild() {},
        remove() {},
        setAttribute() {},
        querySelectorAll() {
          return [];
        },
        getBoundingClientRect() {
          return { top: 0, left: 0, width: 800, height: 600 };
        },
        closest() {
          return null;
        },
        scrollTop: 0,
      });
    return elements.get(key);
  };
  const context: any = {
    URLSearchParams,
    crypto,
    performance: { now: () => now },
    Date: class extends Date {
      static now() {
        return now;
      }
    },
    Element: class {},
    Audio: class {},
    location: { origin: 'https://local.test', search: '?channel=test' },
    navigator: {},
    document: {
      getElementById: element,
      querySelector: element,
      querySelectorAll: () => [],
      createElement: element,
      body: element('body'),
      visibilityState: 'visible',
      addEventListener() {},
    },
    parent: { postMessage: (m: any) => messages.push(structuredClone(m)) },
    addEventListener: (name: string, fn: Function) =>
      (listeners[name] ??= []).push(fn),
    setInterval: (fn: Function) => {
      timers.set(++id, fn);
      return id;
    },
    clearInterval: (n: number) => timers.delete(n),
    setTimeout: (fn: Function, ms: number) => {
      delays.push({ fn, ms });
      return delays.length;
    },
    queueMicrotask: (fn: Function) => fn(),
    console,
    speechSynthesis: { cancel() {} },
  };
  context.window = context;
  createContext(context);
  runInContext(readFileSync('public/exam-simulator/app.js', 'utf8'), context);
  runInContext(
    readFileSync('public/exam-simulator/adapter.js', 'utf8'),
    context,
  );
  const send = (data: any) =>
    listeners.message.forEach((fn) =>
      fn({
        source: context.parent,
        origin: context.location.origin,
        data: { channel: 'test', ...data },
      }),
    );
  send({ type: 'exam-init', pack, snapshot: { fresh: true } });
  assert.ok(element('app').innerHTML.includes('Your Tests'));
  element('#bbCheck').onclick();
  assert.ok(element('app').innerHTML.includes('Room Code'));
  element('#roomNext').onclick();
  assert.ok(element('app').innerHTML.includes('Start Code'));
  element('#startTest').onclick();
  delays.find((d) => d.ms === 1350)!.fn();
  assert.ok(element('app').innerHTML.includes('Directions'));
  element('#continue').onclick();
  assert.equal(runInContext('session.seconds', context), 1920);
  now += 10000;
  for (const fn of [...timers.values()]) fn();
  assert.equal(runInContext('session.seconds', context), 1910);
  runInContext(
    'session.answers["rw1:0"]=0;bbReviewPage(session.base.steps[0])',
    context,
  );
  assert.ok(element('app').innerHTML.includes('Check Your Work'));
  element('#reviewNext').onclick();
  delays.find((d) => d.ms === 1550)!.fn();
  assert.equal(runInContext('session.stepIndex', context), 1);
  assert.equal(runInContext('session.seconds', context), 1920);
  runInContext('session.answers["rw2:0"]=0;bbModuleOver()', context);
  delays
    .filter((d) => d.ms === 1550)
    .at(-1)!
    .fn();
  assert.ok(element('app').innerHTML.includes('All Finished'));
  assert.equal(messages.at(-1).snapshot.finished, true);
  element('#doneHome').onclick();
  assert.equal(messages.at(-1).type, 'exam-exit');
  assert.equal(messages.at(-1).snapshot.answers['rw1:0'], 0);
});
