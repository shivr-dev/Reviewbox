import {
  authenticatedSession,
  requireSiteUser,
  sameOrigin,
  readBody,
  sb,
  fail,
} from '@/lib/server';
export async function GET(req: Request) {
  try {
    await requireSiteUser();
    const s = await authenticatedSession();
    if (req.headers.get('X-Review-Account') !== s.user.id)
      throw new Error('账户已变化，同步已暂停');
    const state = await sb(
      '/rest/v1/rpc/review_sync_status',
      { method: 'POST', body: '{}' },
      s.access_token,
    );
    if (new URL(req.url).searchParams.has('status'))
      return Response.json(state, { headers: { 'Cache-Control': 'no-store' } });
    const cursor = new URL(req.url).searchParams.get('cursor') ?? '';
    if (cursor.length > 160) throw new Error('同步游标不正确');
    const rows = await sb(
      '/rest/v1/review_records?select=id,kind,payload,updated_at,deleted&order=id.asc&limit=300' +
        (cursor ? '&id=gt.' + encodeURIComponent(cursor) : ''),
      {},
      s.access_token,
    );
    return Response.json(
      {
        records: rows,
        cursor: rows.length === 300 ? rows.at(-1).id : null,
        ...state,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return fail(e, 503);
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await requireSiteUser();
    const s = await authenticatedSession();
    if (req.headers.get('X-Review-Account') !== s.user.id)
      throw new Error('账户已变化，同步已暂停');
    const { records, generation } = await readBody(req, 4000000);
    if (typeof generation !== 'string' || !/^[-a-f0-9]{36}$/i.test(generation))
      throw new Error('同步版本已变化，请刷新页面后再试');
    if (!Array.isArray(records) || records.length > 100)
      throw new Error('同步批次过大');
    for (const r of records) {
      if (
        typeof r.id !== 'string' ||
        r.id.length > 160 ||
        ![
          'node',
          'question',
          'event',
          'exam',
          'note',
          'material',
          'setting',
          'test',
          'pack',
          'job',
        ].includes(r.kind) ||
        !r.payload ||
        !Number.isFinite(Date.parse(r.updated_at))
      )
        throw new Error('同步数据格式不正确');
    }
    await sb(
      '/rest/v1/rpc/review_merge_records_v2',
      {
        method: 'POST',
        body: JSON.stringify({ records, expected_generation: generation }),
      },
      s.access_token,
    );
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e, 503);
  }
}
