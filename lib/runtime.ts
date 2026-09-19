export const isStaticSite = () =>
  typeof window !== 'undefined' && (window as any).__REVIEW_STATIC__ === true;
export function assetPath(path: string) {
  return typeof document === 'undefined'
    ? '/' + path.replace(/^\//, '')
    : new URL(path.replace(/^\//, ''), document.baseURI).href;
}
export async function apiFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  if (!isStaticSite()) return fetch(path, init);
  if (path === '/api/account' && (!init?.method || init.method === 'GET'))
    return Response.json({
      user: null,
      aiReady: false,
      cloudReady: false,
      staticMode: true,
    });
  if (
    path === '/api/account' &&
    init?.body &&
    JSON.parse(String(init.body)).action === 'logout'
  )
    return Response.json({ ok: true });
  return Response.json(
    {
      error:
        '当前为 GitHub Pages 本地版。AI、登录和云同步请在原私有网站使用；手动导入和本地学习仍可正常使用。',
    },
    { status: 503 },
  );
}
