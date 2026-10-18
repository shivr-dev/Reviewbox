import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  applicationAssets,
  applicationStyles,
  verifyStyleContent,
  verifyLocal,
  verifyPublished,
} from '../scripts/verify-pages.mjs';

const cssFixture =
  '.alpha-product{}.alpha-rail{}.rb-brand-studio{}.rb-workshop-content{}.combo-soft{}.game-session-hud{}';

test('both application builds consume one shared style entry including Alpha and workshop styles', async () => {
  assert.match(
    await readFile('app/layout.tsx', 'utf8'),
    /import '\.\/product-styles'/,
  );
  assert.match(
    await readFile('static-pages/main.tsx', 'utf8'),
    /import '\.\.\/app\/product-styles'/,
  );
  const entry = await readFile('app/product-styles.ts', 'utf8');
  for (const file of [
    'globals.css',
    'learning-game.css',
    'brand-studio.css',
    'alpha-product.css',
  ])
    assert.ok(entry.includes(file));
});

test('rejects missing styles and the previously published bundle that omitted Alpha layout', () => {
  assert.throws(
    () => applicationStyles('<div id="root"></div>'),
    /missing its built stylesheet/,
  );
  assert.deepEqual(
    applicationStyles(
      '<link href="./assets/app.css" crossorigin rel="stylesheet">',
    ),
    ['./assets/app.css'],
  );
  assert.throws(
    () => verifyStyleContent('.game-session-hud{} .combo-soft{}'),
    /missing .alpha-product/,
  );
  verifyStyleContent(cssFixture);
});

test('rejects the README page that previously overwrote the application', () => {
  assert.throws(
    () => applicationAssets('<h1>Reviewbox</h1><h2>Review · 自适应复习</h2>'),
    /not the Review application/,
  );
  assert.throws(
    () => applicationAssets('<div id="root"></div>'),
    /built JavaScript/,
  );
});

test('current build contains a loadable repository-relative application', async () => {
  await verifyLocal('pages-dist');
});

test('published verification rejects stale releases and validates application scripts', async () => {
  const original = globalThis.fetch;
  const requested = [];
  let sha = 'old';
  globalThis.fetch = async (url) => {
    requested.push(new URL(url).pathname);
    const path = new URL(url).pathname;
    if (path.endsWith('/version.json')) return Response.json({ commit: sha });
    if (path.endsWith('.js'))
      return new Response('/* compiled */', {
        headers: { 'content-type': 'application/javascript' },
      });
    if (path.endsWith('.css'))
      return new Response(cssFixture, {
        headers: { 'content-type': 'text/css' },
      });
    return new Response(
      '<div id="root"></div><script type="module" src="./assets/main.js"></script><link rel="stylesheet" href="./assets/main.css">',
    );
  };
  try {
    await assert.rejects(
      verifyPublished('https://example.test/Reviewbox/', 'new'),
      /expected commit/,
    );
    sha = 'new';
    await verifyPublished('https://example.test/Reviewbox/', 'new');
    assert.ok(requested.includes('/Reviewbox/assets/main.js'));
    assert.ok(requested.includes('/Reviewbox/assets/main.css'));
    globalThis.fetch = async () => new Response('<h1>Reviewbox</h1>');
    await assert.rejects(
      verifyPublished('https://example.test/Reviewbox/', 'new'),
      /not the Review application/,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('published verification rejects a stylesheet URL returning an HTML fallback', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const path = new URL(url).pathname;
    if (path.endsWith('/version.json')) return Response.json({ commit: 'new' });
    if (path.endsWith('.js'))
      return new Response('/* compiled */', {
        headers: { 'content-type': 'application/javascript' },
      });
    if (path.endsWith('.css'))
      return new Response('<h1>Not found</h1>', {
        headers: { 'content-type': 'text/html' },
      });
    return new Response(
      '<div id="root"></div><script src="./assets/app.js"></script><link rel="stylesheet" href="./assets/app.css">',
    );
  };
  try {
    await assert.rejects(
      verifyPublished('https://example.test/Reviewbox/', 'new'),
      /non-CSS response/,
    );
  } finally {
    globalThis.fetch = original;
  }
});
