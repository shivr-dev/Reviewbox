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
  const handler = (window as any).__REVIEW_PAGES_API__;
  if (typeof handler !== 'function') return Response.json({error:'Pages 服务尚未就绪'},{status:503});
  return handler(path, init);
}
