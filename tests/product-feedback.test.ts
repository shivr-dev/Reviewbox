import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateReport,
  validateInsights,
  productArea,
} from '../supabase/functions/review-feedback/contract';
import { verifyWorker } from '../supabase/functions/review-feedback/oidc';
import {
  InsightsBuffer,
  collectionEnabled,
  storeCollectionPreference,
} from '../lib/product-insights';
import {
  hasAcceptedAgreement,
  AGREEMENT_VERSION,
} from '../lib/product-agreement';
import {
  publishFeedback,
  issueBody,
  closeAnsweredIssues,
  feedbackLabels,
} from '../scripts/publish-feedback-issues.mjs';
const report = {
  id: '1393fb22-4cc0-413e-b007-beff4a557ae7',
  receipt: 'a'.repeat(64),
  title: '反馈标题',
  description: '进入页面之后点击按钮，没有出现预期内容。',
  area: 'study',
  publicConsent: true,
};
test('Answered 已答 closes open issues as completed, while other labels do nothing', async () => {
  const updates: any[] = [];
  const github = { rest: { issues: {
    update: async (input: any) => { updates.push(input); },
    listForRepo: async () => ({ data: [{ number: 2, state: 'open' }] }),
  } } };
  const issue = { number: 1, state: 'open', labels: [{ name: 'Answered 已答' }] };
  assert.equal(await closeAnsweredIssues({ github, eventName: 'issues', payload: { action: 'labeled', label: { name: 'bug' }, issue } }), 0);
  assert.equal(await closeAnsweredIssues({ github, eventName: 'issues', payload: { action: 'labeled', label: { name: 'Answered 已答' }, issue } }), 1);
  assert.equal(updates[0].state, 'closed'); assert.equal(updates[0].state_reason, 'completed');
  assert.equal(await closeAnsweredIssues({ github, eventName: 'workflow_dispatch', payload: {} }), 1);
});
test('public reports require explicit consent, reject extra private fields and detected credentials', () => {
  assert.equal(validateReport(report).title, report.title);
  assert.equal(validateReport(report).category, 'bug');
  for (const category of ['bug', 'suggestion', 'question']) assert.equal(validateReport({ ...report, category }).category, category);
  assert.throws(() => validateReport({ ...report, category: 'Answered 已答' }));
  assert.deepEqual(feedbackLabels, { bug: 'bug', suggestion: 'enhancement', question: 'question' });
  assert.throws(() => validateReport({ ...report, publicConsent: false }));
  assert.throws(() =>
    validateReport({ ...report, email: 'private@example.test' }),
  );
  assert.throws(() =>
    validateReport({ ...report, description: 'token ghp_' + 'a'.repeat(30) }),
  );
  assert.throws(() =>
    validateReport({
      ...report,
      environment: {
        build: 'local',
        browser: 'Chrome',
        viewport: 'desktop',
        url: '#secret-id',
      },
    }),
  );
});
test('metrics allow only coarse categories, never identities, content, scores or raw routes', () => {
  const event = {
    event: 'page_view',
    area: 'study',
    device: 'phone',
    duration: 'none',
  };
  assert.equal(validateInsights([event]).length, 1);
  for (const key of [
    'email',
    'userId',
    'questionId',
    'score',
    'message',
    'url',
  ])
    assert.throws(() => validateInsights([{ ...event, [key]: 'secret' }]));
  assert.throws(() =>
    validateInsights([{ ...event, area: '#exam/private-id' }]),
  );
  assert.equal(productArea('assessment'), 'study');
});
test('disabled collection drops pending data and aborts an in-flight send immediately', async () => {
  const calls: RequestInit[] = [];
  const buffer = new InsightsBuffer((async (_url, init) => {
    calls.push(init!);
    return new Response('{}');
  }) as typeof fetch);
  const event = {
    event: 'page_view',
    area: 'home',
    device: 'desktop',
    duration: 'none',
  } as const;
  buffer.add(event);
  await buffer.flush();
  assert.equal(calls.length, 0);
  buffer.configure(true);
  buffer.add(event);
  buffer.configure(false);
  await buffer.flush();
  assert.equal(calls.length, 0);
  buffer.configure(true);
  buffer.add(event);
  await buffer.flush();
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(String(calls[0].body)), {
    events: [event],
    consentVersion: AGREEMENT_VERSION,
  });
  let signal: AbortSignal | null | undefined;
  const pending = new InsightsBuffer(((_url, init) => {
    signal = init?.signal;
    return new Promise((_resolve, reject) =>
      signal?.addEventListener('abort', () => reject(new Error('aborted'))),
    );
  }) as typeof fetch);
  pending.configure(true);
  pending.add(event);
  const flush = pending.flush();
  pending.configure(false);
  await flush;
  assert.equal(signal?.aborted, true);
});
test('preferences isolate accounts, prefer the latest saved choice, and acceptance is versioned', () => {
  const data = new Map<string, string>();
  Object.assign(globalThis, {
    localStorage: {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => data.set(k, v),
    },
    window: new EventTarget(),
  });
  assert.equal(collectionEnabled('first'), true);
  storeCollectionPreference('first', {
    enabled: false,
    updatedAt: '2026-11-01T00:00:00Z',
  });
  assert.equal(collectionEnabled('first'), false);
  assert.equal(collectionEnabled('second'), true);
  assert.equal(
    collectionEnabled('first', {
      enabled: true,
      updatedAt: '2026-11-02T00:00:00Z',
    }),
    true,
  );
  assert.equal(hasAcceptedAgreement(), false);
  assert.equal(
    hasAcceptedAgreement({
      version: 'old',
      acceptedAt: new Date().toISOString(),
    }),
    false,
  );
  assert.equal(
    hasAcceptedAgreement({
      version: AGREEMENT_VERSION,
      acceptedAt: new Date().toISOString(),
    }),
    true,
  );
});
test('worker OIDC rejects another repository, missing expiry and forged signatures', async () => {
  const key = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
  const jwk = {
    ...(await crypto.subtle.exportKey('jwk', key.publicKey)),
    kid: 'feedback-test',
  };
  const request = (async () => Response.json({ keys: [jwk] })) as typeof fetch;
  const now = Date.now(),
    seconds = Math.floor(now / 1000);
  const claims = {
    iss: 'https://token.actions.githubusercontent.com',
    aud: 'reviewbox-feedback',
    repository: 'shivr-dev/Reviewbox',
    repository_id: '1377234479',
    repository_owner_id: '255636973',
    ref: 'refs/heads/main',
    workflow_ref:
      'shivr-dev/Reviewbox/.github/workflows/feedback-issues.yml@refs/heads/main',
    event_name: 'schedule',
    iat: seconds - 2,
    nbf: seconds - 2,
    exp: seconds + 300,
    run_id: '123',
  };
  async function token(c: object) {
    const content =
      Buffer.from(JSON.stringify({ alg: 'RS256', kid: jwk.kid })).toString(
        'base64url',
      ) +
      '.' +
      Buffer.from(JSON.stringify(c)).toString('base64url');
    return (
      content +
      '.' +
      Buffer.from(
        await crypto.subtle.sign(
          'RSASSA-PKCS1-v1_5',
          key.privateKey,
          new TextEncoder().encode(content),
        ),
      ).toString('base64url')
    );
  }
  assert.equal(await verifyWorker(await token(claims), request, now), '123');
  await assert.rejects(
    verifyWorker(
      await token({ ...claims, repository_id: 'another' }),
      request,
      now,
    ),
  );
  await assert.rejects(
    verifyWorker(await token({ ...claims, exp: undefined }), request, now),
  );
  const valid = await token(claims);
  await assert.rejects(
    verifyWorker(valid.slice(0, -5) + 'aaaaa', request, now),
  );
});
test('automatic issue delivery reuses a prior issue after an uncertain acknowledgement', async () => {
  const item = { ...report, category: 'suggestion', lease: 'l', createdAt: new Date().toISOString() };
  let created = 0,
    acknowledged = 0,
    existing: any[] = [];
  const github = {
    rest: {
      issues: {
        listForRepo: async () => ({ data: existing }),
        create: async (input: any) => {
          assert.deepEqual(input.labels, ['enhancement']);
          created++;
          const data = {
            body: input.body,
            html_url: 'https://github.com/shivr-dev/Reviewbox/issues/42',
          };
          existing.push(data);
          return { data };
        },
      },
    },
  };
  const request = (async (url, init) => {
    if (String(url).endsWith('/claim'))
      return Response.json({ reports: [item] });
    if (String(url).endsWith('/ack')) {
      acknowledged++;
      if (acknowledged === 1)
        return Response.json({ error: 'temporary' }, { status: 503 });
    }
    return Response.json({ ok: true });
  }) as typeof fetch;
  await assert.rejects(
    publishFeedback({ github, identityToken: 'oidc', request }),
  );
  assert.equal(
    await publishFeedback({ github, identityToken: 'oidc', request }),
    1,
  );
  assert.equal(created, 1);
  assert.equal(acknowledged, 2);
  assert.ok(
    !issueBody({
      ...report,
      description: '```\n@everyone\n![x](https://example.test)\n```',
    }).includes('\n```text\n'),
  );
});
