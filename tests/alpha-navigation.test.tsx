import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import ProductShell, { ProductHome } from '../components/product-shell';
import { ReviewContext } from '../components/review-context';
import { fixture } from './study-plan-fixtures';
import {
  MAIN_NAV,
  workspaceSection,
  parseWorkspaceRoute,
  workspaceHash,
} from '../lib/workspace-route';
test('Production has precisely five main icons and the existing penguin as the sole profile entry', () => {
  const ctx = {
    data: fixture(),
    subject: 'math',
    section: '',
    navigate: () => {},
  } as any;
  const html = renderToStaticMarkup(
    <ReviewContext.Provider value={ctx}>
      <ProductShell page="forge">
        <p>真实功能</p>
      </ProductShell>
    </ReviewContext.Provider>,
  );
  assert.equal(MAIN_NAV.length, 5);
  for (const name of ['今天', '学习计划', '学科与资料', '成绩与考试', '工坊'])
    assert.match(html, new RegExp('aria-label="' + name + '"'));
  assert.equal((html.match(/class="alpha-nav-button /g) || []).length, 5);
  assert.equal((html.match(/aria-label="我的"/g) || []).length, 1);
  assert.match(html, /game-group/);
  assert.doesNotMatch(html, /aria-label="附魔师"/);
});
test('routes round trip nested subject contexts, encoded course IDs and workshop selection', () => {
  for (const route of [
    { page: 'subjects', subject: 'math', section: 'courses' },
    { page: 'forge', subject: 'loot:a/b', section: '' },
    { page: 'plan', subject: 'all', section: 'launch:initial:a' },
    { page: 'results', subject: 'all', section: 'simulations' },
  ])
    assert.deepEqual(parseWorkspaceRoute(workspaceHash(route)), route);
  assert.equal(workspaceSection('library'), 'subjects');
  assert.equal(workspaceSection('enchant'), 'workshop');
  assert.equal(workspaceSection('you'), 'you');
  assert.equal(parseWorkspaceRoute('#bad/%xx').page, 'home');
});
test('Production home has one main learning action and never fabricates a GPA', () => {
  const ctx = { data: fixture(), subject: 'all', navigate: () => {} } as any;
  const html = renderToStaticMarkup(
    <ReviewContext.Provider value={ctx}>
      <ProductHome />
    </ReviewContext.Provider>,
  );
  assert.match(html, /尚无成绩/);
  assert.doesNotMatch(html, /3\.56/);
  assert.doesNotMatch(html, /进入学习计划/);
  assert.equal((html.match(/primary game-main-action/g) || []).length, 1);
});
