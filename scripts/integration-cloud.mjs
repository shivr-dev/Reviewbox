import assert from 'node:assert/strict';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const test = JSON.parse(input),
  origin = 'http://localhost:3000';
const auth = await fetch(origin + '/signin-with-chatgpt?return_to=/', {
  redirect: 'manual',
});
let cookie = auth.headers
  .getSetCookie()
  .map((c) => c.split(';')[0])
  .join('; ');
async function call(path, body, account) {
  const r = await fetch(origin + '/api/' + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      Cookie: cookie,
      Origin: origin,
      'Content-Type': 'application/json',
      ...(account ? { 'X-Review-Account': account } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  const session = r.headers
    .getSetCookie()
    .find((c) => c.startsWith('review_session='));
  if (session && !session.startsWith('review_session=;')) {
    assert.match(session, /HttpOnly/i);
    assert.match(session, /SameSite=strict/i);
    assert.ok(session.length < 4000);
    cookie = cookie
      .split('; ')
      .filter((c) => !c.startsWith('review_session='))
      .concat(session.split(';')[0])
      .join('; ');
  }
  if (session?.startsWith('review_session=;'))
    cookie = cookie
      .split('; ')
      .filter((c) => !c.startsWith('review_session='))
      .join('; ');
  return { r, data };
}
try {
  const login = await call('account', {
    action: 'login',
    email: test.email,
    password: test.password,
  });
  assert.equal(login.r.status, 200, JSON.stringify(login.data));
  assert.equal(login.data.user.id, test.id);
  console.log('Email/password sign-in and encrypted HttpOnly cookie PASS');
  const rec = {
    id: 'integration-note',
    kind: 'note',
    payload: {
      id: 'integration-note',
      nodeId: 'test-node',
      body: 'Private cloud integration check',
    },
    updated_at: new Date().toISOString(),
    deleted: false,
  };
  const upload = await call('sync', { records: [rec] }, test.id);
  assert.equal(upload.r.status, 200, JSON.stringify(upload.data));
  const pull = await call('sync?cursor=', undefined, test.id);
  assert.equal(pull.r.status, 200, JSON.stringify(pull.data));
  assert.equal(
    pull.data.records.find((r) => r.id === rec.id).payload.body,
    rec.payload.body,
  );
  console.log('Private record upload and download PASS');
  const wrong = await call(
    'sync',
    { records: [{ ...rec, id: 'must-not-save' }] },
    '00000000-0000-4000-8000-000000000001',
  );
  assert.notEqual(wrong.r.status, 200);
  console.log('Changed-account write blocked PASS');
  const get = await call('account');
  assert.equal(get.data.user.id, test.id);
  const out = await call('account', { action: 'logout' });
  assert.equal(out.r.status, 200);
  const after = await call('account');
  assert.equal(after.data.user, null);
  console.log('Account verification and logout PASS');
} finally {
  await call('account', { action: 'logout' }).catch(() => {});
}
