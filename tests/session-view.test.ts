import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionForView } from '../lib/session-view';

test('last answer completion retains the current result instead of reverting to the empty practice entry', () => {
  const current = {
    id: 'practice-1',
    items: [],
    mode: 'review' as const,
    title: '本次练习',
  };
  const jobs = [{ ...current, kind: 'session', status: 'complete' }];
  assert.equal(sessionForView(jobs, current, true)?.id, current.id);
  assert.equal(sessionForView(jobs, current, true)?.title, '本次练习');
  assert.equal(
    sessionForView(jobs, current, false),
    null,
    'no retained result across an account change or after leaving',
  );
  assert.equal(
    sessionForView(jobs, null, true),
    null,
    'never automatically reopen a historical completion',
  );
  assert.equal(
    sessionForView([], current, true),
    null,
    'deleted records cannot leave a stale result',
  );
});
test('ongoing sessions still resume and a completed test keeps its report until the user leaves', () => {
  const current = {
    id: 'test-1',
    items: [],
    mode: 'test' as const,
    title: '阶段测评',
  };
  const active = {
    ...current,
    id: 'practice-2',
    kind: 'session',
    status: 'active',
    createdAt: '2026-10-18T00:00:00Z',
  };
  const jobs = [{ ...current, kind: 'session', status: 'complete' }, active];
  assert.equal(sessionForView(jobs, current, true)?.id, 'test-1');
  assert.equal(sessionForView(jobs, current, false)?.id, 'practice-2');
  assert.equal(sessionForView(jobs, null, true)?.id, 'practice-2');
});
