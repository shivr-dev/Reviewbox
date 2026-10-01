import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const html = readFileSync('public/map-player/index.html', 'utf8');
const script = readFileSync('public/map-player/app.js', 'utf8');
function player() {
  const dom = new JSDOM(html, { url: 'https://example.test/map-player/index.html', runScripts: 'outside-only' });
  const w = dom.window, messages = [], timers = new Map();
  let now = 0, sequence = 0;
  const parent = { postMessage: message => messages.push(message) };
  Object.defineProperty(w, 'parent', { value: parent });
  w.structuredClone = structuredClone;
  w.setTimeout = (fn, ms) => { const id = ++sequence; timers.set(id, { fn, at: now + ms }); return id; };
  w.clearTimeout = id => timers.delete(id);
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.eval(script);
  function receive(type, values = {}) {
    w.dispatchEvent(new w.MessageEvent('message', { source: parent, data: { channel: 'review-map', nonce: 'test-session', type, ...values } }));
  }
  const q = { id: 'manual-map-1', type: 'single-choice', subject: 'Reading', grade: 8, number: 1, title: '', paragraphs: ['A short manually imported passage.'], attribution: '', prompt: 'Choose the main idea.', choices: ['A', 'B'] };
  const saved = { answers: {}, gaps: {}, pronoun: null, text: '', zoom: 100, note: '', eliminated: [], marks: [] };
  function init(screen = 'login', extra = {}) { receive('init', { question: q, state: saved, student: 'Student Guest', section: 'Reading', grade: 8, screen, practice: false, ...extra }); }
  function advance(ms) {
    const end = now + ms;
    while (true) {
      const entry = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!entry) break;
      now = entry[1].at; timers.delete(entry[0]); entry[1].fn();
    }
    now = end;
  }
  return { w, messages, receive, init, advance, close: () => dom.window.close() };
}

test('embedded login animation continues through selection, confirmation and saved-question entry without URL navigation', () => {
  const p = player();
  try {
    p.init();
    assert.equal(p.w.document.querySelector('#login').hidden, false);
    assert.ok(p.messages.some(m => m.type === 'initialized'));
    p.w.document.querySelector('.login-next').click();
    assert.equal(p.w.document.querySelector('#boot-loader').hidden, false);
    p.advance(1900);
    assert.equal(p.w.document.querySelector('#session-screen').className, 'session-select-test');
    p.w.document.querySelector('.selection-actions button').click();
    assert.equal(p.w.document.querySelector('#session-screen').className, 'session-self-confirm');
    p.w.document.querySelector('.self-yes').click();
    assert.ok(p.messages.some(m => m.type === 'prepare'));
    p.receive('confirmed');
    p.w.document.querySelector('.session-next').click();
    assert.ok(p.messages.some(m => m.type === 'start'));
    p.init('question'); p.advance(650);
    assert.equal(p.w.document.querySelector('#player').hidden, false);
    assert.equal(p.w.document.querySelector('#question .prompt').textContent, 'Choose the main idea.');
    p.w.document.querySelector('.choice-main').click();
    p.w.document.querySelector('.next').click();
    assert.ok(p.messages.some(m => m.type === 'next' && m.state.answers.main[0] === 0));
    assert.equal(p.w.location.hash, '');
  } finally { p.close(); }
});

test('initialization probe responds and an existing answer is restored on reconnect', () => {
  const p = player();
  try {
    p.receive('ping');
    assert.ok(p.messages.some(m => m.type === 'ready'));
    p.init('question', { state: { answers: { main: [1] }, gaps: {}, pronoun: null, text: '', zoom: 100, note: 'Saved note', eliminated: [], marks: [] } });
    p.advance(650);
    assert.equal(p.w.document.querySelectorAll('.choice-main')[1].getAttribute('aria-checked'), 'true');
    assert.equal(p.w.document.querySelector('#notepad textarea').value, 'Saved note');
    assert.equal(p.w.document.querySelector('.next').disabled, false);
  } finally { p.close(); }
});

test('only the trusted bundled MAP renderer has same-origin access', () => {
  const source = readFileSync('components/map-native-room.tsx', 'utf8');
  assert.match(source, /src=\{assetPath\('map-player\/index.html'\)\}/);
  assert.match(source, /sandbox="allow-scripts allow-same-origin allow-modals allow-popups"/);
  assert.match(source, /message.type==='ready'.*if\(!ready.current\)/);
  assert.match(source, /onLoad=\{\(\)=>send\('ping'\)\}/);
});
