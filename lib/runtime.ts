export const isStaticSite = () =>
  typeof window !== 'undefined' && (window as any).__REVIEW_STATIC__ === true;
export const usesPrivateCloud = () => {
  if (typeof window === 'undefined') return false;
  if (isStaticSite()) return true;
  if (['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname))
    return true;
  try {
    return window.localStorage.getItem('review-private-cloud') === '1';
  } catch {
    return false;
  }
};
export function assetPath(path: string) {
  return typeof document === 'undefined'
    ? '/' + path.replace(/^\//, '')
    : new URL(path.replace(/^\//, ''), document.baseURI).href;
}
export async function apiFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  if (!usesPrivateCloud()) return fetch(path, init);
  const handler = (window as any).__REVIEW_PAGES_API__;
  if (typeof handler !== 'function' && isStaticSite())
    return Response.json({ error: 'Pages 服务尚未就绪' }, { status: 503 });
  if (typeof handler !== 'function')
    return (await import('./pages-cloud')).pagesApi(path, init);
  return handler(path, init);
}
