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

test('pause PIN rejects invalid input, accepts 0000, and resumes with the saved answer', () => {
  const p = player();
  try {
    p.init('slow-down');
    const pin = p.w.document.querySelector('#proctor-pin');
    pin.value = '1234'; pin.dispatchEvent(new p.w.Event('input'));
    assert.equal(p.w.document.querySelector('#resume-button').disabled, true);
    pin.value = '0000'; pin.dispatchEvent(new p.w.Event('input'));
    p.w.document.querySelector('#resume-button').click();
    assert.ok(p.messages.some(m => m.type === 'resume'));
    p.init('question', { state: { answers: { main: [0] }, gaps: {}, pronoun: null, text: '', zoom: 125, note: 'Resume note', eliminated: [], marks: [] } });
    p.advance(650);
    assert.equal(p.w.document.querySelector('.choice-main').getAttribute('aria-checked'), 'true');
    assert.equal(p.w.document.querySelector('#zoom-value').textContent, '125%');
  } finally { p.close(); }
});

test('saving errors release controls for retry and completed exams offer the actual report', () => {
  const p = player();
  try {
    p.init('question'); p.advance(650);
    p.w.document.querySelector('.choice-main').click();
    p.w.document.querySelector('.next').click();
    assert.equal(p.w.document.querySelector('#player').inert, true);
    p.receive('error', { message: 'Please retry saving.' });
    assert.equal(p.w.document.querySelector('#player').inert, false);
    assert.equal(p.w.document.querySelector('.next').disabled, false);
    p.init('test-ended', { completedAt: '2026-10-02T00:00:00Z', totalMilliseconds: 90000 });
    assert.match(p.w.document.querySelector('.ending-summary').textContent, /00:01:30/);
    p.w.document.querySelector('.ending-done').click();
    assert.ok(p.messages.some(m => m.type === 'report'));
  } finally { p.close(); }
});

test('practice feedback locks answer changes and continues after manual verification', () => {
  const p = player();
  try {
    p.init('question', { practice: true, checked: true,
      state: { answers: { main: [1] }, gaps: {}, pronoun: null, text: '', zoom: 100, note: '', eliminated: [], marks: [] },
      feedback: { correct: true, answer: 'B', explanation: 'A manually supplied explanation.' } });
    p.advance(650);
    assert.equal(p.w.document.querySelector('.choice-main').disabled, true);
    assert.match(p.w.document.querySelector('.review-feedback').textContent, /manually supplied/);
    assert.equal(p.w.document.querySelector('.next').disabled, false);
    p.w.document.querySelector('.next').click();
    assert.ok(p.messages.some(m => m.type === 'next' && m.state.answers.main[0] === 1));
  } finally { p.close(); }
});

test('the trusted MAP frame permits native submit events as well as private asset access', () => {
  const source = readFileSync('components/map-native-room.tsx', 'utf8');
  assert.match(source, /src=\{assetPath\('map-player\/index.html'\)\}/);
  const permissions = source.match(/sandbox="([^"]+)"/)[1].split(' ');
  assert.ok(permissions.includes('allow-same-origin'));
  // jsdom does not enforce iframe sandbox flags. Check the actual host too:
  // HTML form submission returns before firing submit when allow-forms is absent.
  assert.ok(permissions.includes('allow-forms'), 'Login, test selection and resume forms need allow-forms');
  assert.match(source, /message.type==='ready'.*if\(!ready.current\)/);
  assert.match(source, /onLoad=\{\(\)=>send\('ping'\)\}/);
});
