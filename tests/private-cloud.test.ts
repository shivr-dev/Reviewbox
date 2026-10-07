import test from 'node:test';
import assert from 'node:assert/strict';
import { apiFetch, usesPrivateCloud } from '../lib/runtime';
import { unlockPages, lockPages } from '../lib/pages-vault';
import { rewardsRequest, describeReward } from '../lib/rewards-client';
import { learningGame } from '../lib/learning-game';
import { loadData, switchAccount } from '../lib/store';

test('local unlocked config routes login and rewards directly to Supabase; locking does not erase learning data', async () => {
  const originalWindow = globalThis.window,
    originalStorage = Object.getOwnPropertyDescriptor(
      globalThis,
      'localStorage',
    ),
    originalFetch = globalThis.fetch;
  const values = new Map<string, string>();
  const storage = {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => values.set(k, v),
    removeItem: (k: string) => values.delete(k),
  };
  Object.defineProperty(globalThis, 'window', {
    value: { location: { hostname: 'localhost' } },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  });
  const phrase = 'test-only-vault-password',
    salt = crypto.getRandomValues(new Uint8Array(16)),
    iv = crypto.getRandomValues(new Uint8Array(12));
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(phrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
  const config = {
    supabaseUrl: 'https://fixture.supabase.co',
    publishableKey: 'sb_publishable_fixture',
    cloudflareAccountId: 'a'.repeat(32),
    cloudflareTokens: [],
  };
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify(config)),
  );
  const b64 = (v: ArrayBuffer | Uint8Array) =>
    Buffer.from(v instanceof Uint8Array ? v : new Uint8Array(v)).toString(
      'base64',
    );
  const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith('pages-vault.json'))
      return Response.json({
        version: 1,
        salt: b64(salt),
        iv: b64(iv),
        ciphertext: b64(ciphertext),
      });
    assert.ok(url.startsWith(config.supabaseUrl));
    if (url.includes('/auth/v1/token'))
      return Response.json({
        access_token: 'test-jwt',
        refresh_token: 'test-refresh',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: 'fixture-user', email: 'fixture@example.test' },
      });
    if (url.endsWith('/rest/v1/rpc/review_game')) {
      assert.equal(
        new Headers(init?.headers).get('Authorization'),
        'Bearer test-jwt',
      );
      return Response.json({
        admin: true,
        redeemedReward: { coins: 77, freezes: 1, skin: 'skin-raincoat' },
        grants: [
          {
            id: 'fixture-redemption',
            at: new Date(Date.now() - 50).toISOString(),
            source: 'code',
            rewards: { coins: 77, freezes: 1, skin: 'skin-raincoat' },
          },
        ],
        superUntil: null,
        codes: [],
      });
    }
    throw new Error('Unexpected route ' + url);
  };
  try {
    assert.equal(usesPrivateCloud(), true);
    await unlockPages(phrase);
    const login = await apiFetch('/api/account', {
      method: 'POST',
      body: JSON.stringify({
        action: 'login',
        email: 'fixture@example.test',
        password: 'fixture-password',
      }),
    });
    assert.equal(((await login.json()) as any).user.id, 'fixture-user');
    const rewards = await apiFetch('/api/game', {
      method: 'POST',
      body: JSON.stringify({ action: 'admin-list', payload: {} }),
    });
    assert.equal(((await rewards.json()) as any).admin, true);
    assert.ok(calls.some((c) => c.includes('/rest/v1/rpc/review_game')));
    assert.ok(calls.every((c) => !c.endsWith('/api/account')));
    await switchAccount('private-cloud-fixture');
    const receipt = await rewardsRequest('redeem', {
      code: 'FIXTURE',
      requestId: 'fixture-request',
    });
    await rewardsRequest('redeem', {
      code: 'FIXTURE',
      requestId: 'fixture-request',
    });
    assert.match(
      describeReward(receipt.redeemedReward!),
      /77 点数.*连胜冻结.*雨中漫步/,
    );
    const owned = learningGame(await loadData());
    assert.equal(owned.coins, 77);
    assert.equal(owned.freezes, 1);
    assert.ok(owned.owned.has('skin-raincoat'));
    await lockPages();
    assert.ok(learningGame(await loadData()).owned.has('skin-raincoat'));
    const locked = await apiFetch('/api/account');
    assert.equal(((await locked.json()) as any).vaultLocked, true);
  } finally {
    await lockPages();
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, 'window', {
      value: originalWindow,
      configurable: true,
      writable: true,
    });
    if (originalStorage)
      Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else delete (globalThis as any).localStorage;
  }
});
