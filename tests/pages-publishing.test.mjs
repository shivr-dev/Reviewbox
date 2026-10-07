import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applicationAssets,
  verifyLocal,
  verifyPublished,
} from '../scripts/verify-pages.mjs';

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
    return new Response(
      '<div id="root"></div><script type="module" src="./assets/main.js"></script>',
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
    globalThis.fetch = async () => new Response('<h1>Reviewbox</h1>');
    await assert.rejects(
      verifyPublished('https://example.test/Reviewbox/', 'new'),
      /not the Review application/,
    );
  } finally {
    globalThis.fetch = original;
  }
});
