import { validateReport, validateInsights, UUID, RECEIPT } from './contract.ts';
import { verifyWorker } from './oidc.ts';
const allowedOrigin = (origin: string) =>
  [
    'https://shivr-dev.github.io',
    'https://review-study-kevin.shivrdream.chatgpt.site',
  ].includes(origin) ||
  /^http:\/\/(?:localhost|127\.0\.0\.1):\d{2,5}$/.test(origin);
const json = (body: unknown, status: number, origin: string) =>
  Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': allowedOrigin(origin) ? origin : 'null',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      Vary: 'Origin',
      'X-Content-Type-Options': 'nosniff',
    },
  });
const hex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
async function boundedBody(req: Request) {
  const reader = req.body?.getReader();
  if (!reader) throw new Error('请求为空。');
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 28000) {
      await reader.cancel();
      throw new Error('内容过长。');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(bytes);
}
Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') ?? '';
  if (req.method === 'OPTIONS')
    return json({}, allowedOrigin(origin) ? 200 : 403, origin);
  if (req.method !== 'POST')
    return json({ error: 'Unsupported method' }, 405, origin);
  const action = new URL(req.url).pathname.split('/').at(-1);
  const worker = action === 'claim' || action === 'ack' || action === 'release';
  if (!worker && !allowedOrigin(origin))
    return json({ error: '此来源无法提交反馈。' }, 403, origin);
  try {
    const raw = await boundedBody(req);
    const body = JSON.parse(raw);
    const url = Deno.env.get('SUPABASE_URL')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    async function rpc(payload: unknown) {
      const r = await fetch(url + '/rest/v1/rpc/review_product_operation', {
        method: 'POST',
        headers: {
          apikey: service,
          Authorization: 'Bearer ' + service,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ operation: action, payload }),
        signal: AbortSignal.timeout(12000),
      });
      if (!r.ok) throw new Error('反馈服务暂时不可用，请重试。');
      return r.json();
    }
    if (worker) {
      try {
        await verifyWorker(
          (req.headers.get('authorization') ?? '').replace(/^Bearer /, ''),
        );
      } catch {
        return json({ error: 'Worker authentication failed' }, 401, origin);
      }
      if (action === 'claim') return json(await rpc({}), 200, origin);
      if (
        !UUID.test(body.id ?? '') ||
        !UUID.test(body.lease ?? '') ||
        (action === 'ack' &&
          !/^https:\/\/github\.com\/shivr-dev\/Reviewbox\/issues\/[1-9]\d*$/.test(
            body.url ?? '',
          ))
      )
        return json({ error: 'Invalid acknowledgement' }, 400, origin);
      return json(
        await rpc({
          id: body.id,
          lease: body.lease,
          ...(action === 'ack' ? { url: body.url } : {}),
        }),
        200,
        origin,
      );
    }
    // The IP is used only to derive a daily abuse-limit key; neither raw IP nor a stable identifier is stored.
    const hmac = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(service),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const ip = (
      req.headers.get('x-forwarded-for') ??
      req.headers.get('cf-connecting-ip') ??
      'unknown'
    )
      .split(',')[0]
      .trim();
    const quotaKey = hex(
      await crypto.subtle.sign(
        'HMAC',
        hmac,
        new TextEncoder().encode(
          new Date().toISOString().slice(0, 10) + '|' + ip,
        ),
      ),
    );
    if (action === 'submit') {
      const report = validateReport(body);
      const receiptHash = hex(
        await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(report.receipt),
        ),
      );
      const { receipt: _, ...safe } = report;
      const result = await rpc({ ...safe, receiptHash, quotaKey });
      return json(result, result.error ? 429 : 200, origin);
    }
    if (action === 'status') {
      if (!UUID.test(body.id ?? '') || !RECEIPT.test(body.receipt ?? ''))
        return json({ error: '反馈回执无效。' }, 400, origin);
      const receiptHash = hex(
        await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(body.receipt),
        ),
      );
      return json(await rpc({ id: body.id, receiptHash }), 200, origin);
    }
    if (action === 'metrics') {
      if (body.consentVersion !== '2026-11-01')
        return json({ error: 'Consent required' }, 400, origin);
      const events = validateInsights(body.events);
      const result = await rpc({ events, quotaKey });
      return json(result, result.error ? 429 : 200, origin);
    }
    return json({ error: 'Unsupported request' }, 404, origin);
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error
            ? error.message.slice(0, 160)
            : '请求未完成，请稍后重试。',
      },
      400,
      origin,
    );
  }
});
