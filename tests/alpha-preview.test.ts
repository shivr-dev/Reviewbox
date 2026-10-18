import test from 'node:test';
import assert from 'node:assert/strict';
import { setAlphaPreview } from '../lib/alpha-preview';
import {
  allRecords,
  currentNamespace,
  loadData,
  put,
  switchAccount,
} from '../lib/store';

test('Alpha is opt-in, persists, exits cleanly, and preserves learning settings and records', async () => {
  await switchAccount('alpha-preview-fixture');
  try {
    assert.notEqual((await loadData()).settings.alphaPreview, true);
    await put(
      'setting',
      {
        name: 'Alpha test',
        dailyMinutes: 35,
        examGpa: { scale: 4, formula: 'score / total * 4', weighted: true },
      },
      'settings',
    );
    await put(
      'job',
      {
        id: 'alpha-existing-study',
        kind: 'session',
        status: 'active',
        items: [],
      },
      'alpha-existing-study',
    );
    const before = await allRecords();
    await setAlphaPreview(true);
    let d = await loadData();
    assert.equal(d.settings.alphaPreview, true);
    assert.equal(d.settings.dailyMinutes, 35);
    assert.equal(d.settings.examGpa?.formula, 'score / total * 4');
    assert.deepEqual(
      (await allRecords()).filter((r) => r.kind !== 'setting'),
      before.filter((r) => r.kind !== 'setting'),
    );
    await setAlphaPreview(false);
    d = await loadData();
    assert.equal(d.settings.alphaPreview, false);
    assert.equal(d.settings.name, 'Alpha test');
    const ns = currentNamespace();
    await switchAccount('alpha-preview-second-fixture');
    assert.notEqual((await loadData()).settings.alphaPreview, true);
    await assert.rejects(setAlphaPreview(true, ns), /账户已切换/);
    assert.notEqual((await loadData()).settings.alphaPreview, true);
  } finally {
    await switchAccount(null);
  }
});
