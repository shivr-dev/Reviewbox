const ISSUER = 'https://token.actions.githubusercontent.com';
const AUDIENCE = 'reviewbox-feedback';
let cached:
  | { keys: (JsonWebKey & { kid?: string })[]; until: number }
  | undefined;
function decode(part: string) {
  return Uint8Array.from(
    atob(part.replace(/-/g, '+').replace(/_/g, '/')),
    (c) => c.charCodeAt(0),
  );
}
export async function verifyWorker(
  token: string,
  request = fetch,
  now = Date.now(),
) {
  if (token.length > 16000) throw new Error('Invalid worker identity');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid worker identity');
  const header = JSON.parse(new TextDecoder().decode(decode(parts[0])));
  const claims = JSON.parse(new TextDecoder().decode(decode(parts[1])));
  if (header.alg !== 'RS256' || typeof header.kid !== 'string')
    throw new Error('Invalid worker algorithm');
  const seconds = now / 1000;
  if (
    claims.iss !== ISSUER ||
    claims.aud !== AUDIENCE ||
    claims.repository !== 'shivr-dev/Reviewbox' ||
    claims.repository_id !== '1377234479' ||
    claims.repository_owner_id !== '255636973' ||
    claims.ref !== 'refs/heads/main' ||
    claims.workflow_ref !==
      'shivr-dev/Reviewbox/.github/workflows/feedback-issues.yml@refs/heads/main' ||
    !['push', 'schedule', 'workflow_dispatch'].includes(claims.event_name) ||
    typeof claims.exp !== 'number' ||
    claims.exp <= seconds ||
    typeof claims.iat !== 'number' ||
    claims.iat > seconds + 30 ||
    claims.exp - claims.iat > 900 ||
    typeof claims.nbf !== 'number' ||
    claims.nbf > seconds + 30
  )
    throw new Error('Untrusted worker identity');
  if (
    !cached ||
    cached.until < now ||
    !cached.keys.some((k) => k.kid === header.kid)
  ) {
    const response = await request(ISSUER + '/.well-known/jwks', {
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('Identity provider unavailable');
    const value = (await response.json()) as {
      keys?: (JsonWebKey & { kid?: string })[];
    };
    if (!Array.isArray(value.keys))
      throw new Error('Invalid identity provider response');
    cached = { keys: value.keys, until: now + 300000 };
  }
  const jwk = cached.keys.find((k) => k.kid === header.kid);
  if (!jwk || jwk.kty !== 'RSA') throw new Error('Unknown worker identity key');
  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  if (
    !(await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      decode(parts[2]),
      new TextEncoder().encode(parts[0] + '.' + parts[1]),
    ))
  )
    throw new Error('Invalid worker signature');
  return String(claims.run_id);
}
