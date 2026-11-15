export async function POST() {
  return Response.json({ code: 'retired' }, { status: 410 });
}
