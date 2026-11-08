import test from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import {
  NaviActivity,
  NaviLayer,
  NaviSurface,
} from '../components/navi-presentation';
import NaviResponse from '../components/navi-response';
import NaviUnderstandingCheck from '../components/navi-understanding-check';
import NaviSelectionEntry from '../components/navi-selection-entry';
import { NaviUIController, registerNaviUI } from '../lib/navi-ui';

test('Navi escapes clipped page containers, restores focus, and removes request activity on completion', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  host.style.cssText =
    'transform:translateZ(0);overflow:hidden;height:10px;isolation:isolate';
  document.body.appendChild(host);
  const launcher = document.createElement('button');
  host.appendChild(launcher);
  launcher.focus();
  const mount = document.createElement('div');
  host.appendChild(mount);
  const root = createRoot(mount);
  try {
    await act(async () =>
      root.render(
        <NaviLayer>
          <NaviSurface label="Navi">
            <NaviActivity label="正在组织解释…" />
          </NaviSurface>
        </NaviLayer>,
      ),
    );
    const panel = document.querySelector('#navi-workspace')!;
    assert.equal(panel.parentElement, document.body);
    assert.equal(host.contains(panel), false);
    assert.match(
      panel.querySelector('[role="status"]')!.textContent!,
      /正在组织解释/,
    );
    assert.equal(panel.querySelectorAll('.navi-activity-wave i').length, 3);
    assert.equal(
      panel.querySelector('.navi-activity-wave')!.getAttribute('aria-hidden'),
      'true',
    );
    await act(async () =>
      root.render(
        <NaviLayer>
          <NaviSurface label="Navi">
            <p>解释已完成</p>
          </NaviSurface>
        </NaviLayer>,
      ),
    );
    assert.equal(panel.querySelector('[role="status"]'), null);
    await act(async () => root.unmount());
    assert.equal(document.querySelector('#navi-workspace'), null);
    assert.equal(document.activeElement, launcher);
  } finally {
    host.remove();
  }
});

test('an understanding answer requires an explicit submission and becomes read only after feedback', async () => {
  const mount = document.createElement('div');
  document.body.appendChild(mount);
  const root = createRoot(mount);
  const answers: string[] = [];
  try {
    await act(async () =>
      root.render(
        <NaviUnderstandingCheck
          question="Why both sides?"
          busy={false}
          answered={false}
          onAnswer={(a) => answers.push(a)}
        />,
      ),
    );
    assert.equal(
      (mount.querySelector('button') as HTMLButtonElement).disabled,
      true,
    );
    assert.equal(answers.length, 0);
    const textarea = mount.querySelector('textarea')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value',
      )!.set!.call(textarea, 'To keep them equal.');
      textarea.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    assert.equal(answers.length, 0);
    await act(async () =>
      mount
        .querySelector('form')!
        .dispatchEvent(
          new window.Event('submit', { bubbles: true, cancelable: true }),
        ),
    );
    assert.deepEqual(answers, ['To keep them equal.']);
    await act(async () =>
      root.render(
        <NaviUnderstandingCheck
          question="Why both sides?"
          busy={false}
          answered
          onAnswer={(a) => answers.push(a)}
        />,
      ),
    );
    assert.equal(mount.querySelector('textarea'), null);
  } finally {
    await act(async () => root.unmount());
    mount.remove();
  }
});
test('selection follow-ups quote the actual learning canvas and are unavailable in protected exams', async () => {
  const app = document.createElement('main');
  app.className = 'review-application';
  app.innerHTML = '<p>Preserve the equality.</p>';
  document.body.appendChild(app);
  const mount = document.createElement('div');
  document.body.appendChild(mount);
  const root = createRoot(mount),
    chosen: any[] = [];
  const controller = new NaviUIController({
    panels: ['question'],
    questionIds: ['q1'],
    molecule: false,
    protected: false,
  });
  controller.target = { type: 'question', id: 'q1' };
  const unregister = registerNaviUI(controller, 100);
  const original = Object.getOwnPropertyDescriptor(
    window.Range.prototype,
    'getBoundingClientRect',
  );
  Object.defineProperty(window.Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ left: 20, bottom: 60 }),
  });
  try {
    await act(async () =>
      root.render(
        <NaviSelectionEntry onChoose={(target) => chosen.push(target)} />,
      ),
    );
    const range = document.createRange();
    range.selectNodeContents(app.querySelector('p')!);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    await act(async () =>
      document.dispatchEvent(new window.Event('pointerup', { bubbles: true })),
    );
    assert.ok(mount.querySelector('button'));
    await act(async () => mount.querySelector('button')!.click());
    assert.deepEqual(chosen, [
      { type: 'question', id: 'q1', selectedText: 'Preserve the equality.' },
    ]);
    controller.capabilities.protected = true;
    await act(async () =>
      document.dispatchEvent(new window.Event('pointerup', { bubbles: true })),
    );
    assert.equal(mount.querySelector('button'), null);
  } finally {
    unregister();
    await act(async () => root.unmount());
    app.remove();
    mount.remove();
    window.getSelection()?.removeAllRanges();
    if (original)
      Object.defineProperty(
        window.Range.prototype,
        'getBoundingClientRect',
        original,
      );
    else delete (window.Range.prototype as any).getBoundingClientRect;
  }
});

test('Navi uses a manual non-modal browser top layer when supported', async () => {
  const proto = HTMLElement.prototype as any;
  const previousShow = Object.getOwnPropertyDescriptor(proto, 'showPopover');
  const previousHide = Object.getOwnPropertyDescriptor(proto, 'hidePopover');
  const previousMatches = proto.matches;
  let shown = 0,
    hidden = 0;
  Object.defineProperty(proto, 'showPopover', {
    configurable: true,
    value() {
      this.dataset.testOpen = '1';
      shown++;
    },
  });
  Object.defineProperty(proto, 'hidePopover', {
    configurable: true,
    value() {
      delete this.dataset.testOpen;
      hidden++;
    },
  });
  proto.matches = function (selector: string) {
    return selector === ':popover-open'
      ? this.dataset.testOpen === '1'
      : previousMatches.call(this, selector);
  };
  const mount = document.createElement('div');
  document.body.appendChild(mount);
  const root = createRoot(mount);
  try {
    await act(async () =>
      root.render(
        <NaviLayer>
          <NaviSurface label="Navi">
            <p>Learning continues alongside Navi</p>
          </NaviSurface>
        </NaviLayer>,
      ),
    );
    assert.equal(
      document.querySelector('#navi-workspace')!.getAttribute('popover'),
      'manual',
    );
    assert.equal(document.querySelector('[aria-modal="true"]'), null);
    assert.equal(shown, 1);
    await act(async () => root.unmount());
    assert.equal(hidden, 1);
  } finally {
    mount.remove();
    proto.matches = previousMatches;
    if (previousShow) Object.defineProperty(proto, 'showPopover', previousShow);
    else delete proto.showPopover;
    if (previousHide) Object.defineProperty(proto, 'hidePopover', previousHide);
    else delete proto.hidePopover;
  }
});

test('Tutor typography preserves mathematics and renders HTML and links as inert text', async () => {
  const mount = document.createElement('div');
  document.body.appendChild(mount);
  const root = createRoot(mount);
  try {
    await act(async () =>
      root.render(
        <NaviResponse
          text={
            '### 等式变形\n\n两边同时**减去 3**。\n\n1. $2x=6$\n2. $x=3$\n\n$$\nx^2+1\n$$\n\n<img src=x onerror=alert(1)> [点击](javascript:alert(1))'
          }
        />,
      ),
    );
    assert.equal(mount.querySelector('h3')!.textContent, '等式变形');
    assert.equal(mount.querySelector('strong')!.textContent, '减去 3');
    assert.equal(mount.querySelectorAll('ol > li').length, 2);
    assert.equal(mount.querySelectorAll('.katex').length, 3);
    assert.equal(mount.querySelectorAll('img,a,script').length, 0);
    assert.match(mount.textContent!, /onerror/);
  } finally {
    await act(async () => root.unmount());
    mount.remove();
  }
});

test('Fullscreen Navi suspends the underlying canvas and restores it when docked', async () => {
  const app = document.createElement('div');
  app.className = 'review-application';
  document.body.appendChild(app);
  const root = createRoot(app);
  try {
    await act(async () =>
      root.render(
        <NaviLayer>
          <NaviSurface label="Navi" fullscreen>
            <header>
              <button>Dock</button>
            </header>
          </NaviSurface>
        </NaviLayer>,
      ),
    );
    assert.equal(app.inert, true);
    assert.equal(
      document.querySelector('#navi-workspace')?.getAttribute('data-mode'),
      'fullscreen',
    );
    await act(async () =>
      root.render(
        <NaviLayer>
          <NaviSurface label="Navi">
            <header>
              <button>Fullscreen</button>
            </header>
          </NaviSurface>
        </NaviLayer>,
      ),
    );
    assert.notEqual(app.inert, true);
    assert.equal(
      document.querySelector('#navi-workspace')?.getAttribute('data-mode'),
      'docked',
    );
  } finally {
    await act(async () => root.unmount());
    app.remove();
  }
});
