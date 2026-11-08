import { naviContextSchema, type NaviContext } from './navi-context';
export type NaviWebResult = {
  pageId: number;
  revision: number;
  title: string;
  text: string;
  url: string;
  language: string;
};
/** Explicit requests open a query preview; detecting an intent never sends it to the internet. */
export function parseNaviWebIntent(input: string): string | undefined {
  if (/不要|别|別|do not|don't|ne .*pas/i.test(input)) return;
  const match = input
    .trim()
    .match(
      /^(?:(?:请|請|帮我|幫我|please)\s*)?(?:联网查证|联网搜索|联网查|聯網查證|聯網搜尋|去网上查|去網上查|上网查|上網查|网上搜索|網上搜尋|search (?:the )?web(?: for)?|look online for|ネットで検索|온라인 검색|buscar en internet|rechercher sur internet|найти в интернете)[\s：:，,]*(.{0,120})$/iu,
    );
  return match?.[1]?.trim();
}
export function safeNaviWebURL(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      /^(?:zh|en|ja|ko|es|fr|ru)\.wikipedia\.org$/.test(url.hostname) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
/** Explicit keyword lookup, with no account ID, learning history, cookies or AI credentials. */
export async function searchNaviWebSources(
  query: string,
  locale: string,
  signal?: AbortSignal,
): Promise<NaviWebResult[]> {
  const text = query.trim();
  if (!text || text.length > 120) throw Error('query');
  const language = locale.startsWith('zh')
    ? 'zh'
    : ['en', 'ja', 'ko', 'es', 'fr', 'ru'].includes(locale.split('-')[0])
      ? locale.split('-')[0]
      : 'en';
  const url = new URL(`https://${language}.wikipedia.org/w/api.php`);
  url.search = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    origin: '*',
    generator: 'search',
    gsrsearch: text,
    gsrnamespace: '0',
    gsrlimit: '3',
    prop: 'extracts|revisions',
    exintro: '1',
    explaintext: '1',
    exchars: '5000',
    rvprop: 'ids',
  }).toString();
  const response = await fetch(url, {
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
      : AbortSignal.timeout(15000),
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
  if (!response.ok) throw Error('network');
  const body: any = await response.json();
  if (body.error) throw Error('network');
  return (Array.isArray(body.query?.pages) ? body.query.pages : [])
    .slice()
    .sort((a: any, b: any) => (a.index ?? 0) - (b.index ?? 0))
    .slice(0, 3)
    .flatMap((p: any) => {
      const pageId = Number(p.pageid),
        revision = Number(p.revisions?.[0]?.revid);
      if (
        !Number.isSafeInteger(pageId) ||
        pageId <= 0 ||
        !Number.isSafeInteger(revision) ||
        revision <= 0 ||
        typeof p.title !== 'string' ||
        typeof p.extract !== 'string' ||
        !p.extract.trim()
      )
        return [];
      return [
        {
          pageId,
          revision,
          title: p.title.slice(0, 250),
          text: p.extract.slice(0, 5000),
          language,
          url: `https://${language}.wikipedia.org/w/index.php?curid=${pageId}&oldid=${revision}`,
        },
      ];
    });
}
export function naviWebContext(result: NaviWebResult): NaviContext {
  if (
    !safeNaviWebURL(result.url) ||
    !Number.isSafeInteger(result.pageId) ||
    result.pageId <= 0 ||
    !Number.isSafeInteger(result.revision) ||
    result.revision <= 0
  )
    throw Error('source');
  return naviContextSchema.parse({
    context_type: 'web',
    source_id: `wiki:${result.language}:${result.pageId}`,
    source_version: 'revision-' + result.revision,
    title: result.title,
    relevant_content: JSON.stringify({
      title: result.title,
      url: result.url,
      excerpt: result.text,
      source: 'Wikipedia',
      license: 'CC BY-SA; consult the original page for attribution and terms.',
      retrievedAt: new Date().toISOString(),
      notice:
        'External encyclopedia reference, not the learning pack or an official exam rule. This excerpt may be incomplete.',
    }),
    selected_text: '',
    related_question_ids: [],
    knowledge_refs: [],
    source_location: { external_url: result.url },
    provenance: 'web-reference',
  });
}
