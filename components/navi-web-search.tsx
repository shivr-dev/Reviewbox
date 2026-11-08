'use client';
import { useEffect, useRef, useState } from 'react';
import i18n, { tr } from '@/lib/i18n';
import {
  naviWebContext,
  searchNaviWebSources,
  type NaviWebResult,
} from '@/lib/navi-web-sources';
import type { NaviContext } from '@/lib/navi-context';
const t = (key: string) => tr('study:navi.web.' + key);
export default function NaviWebSearch({
  onChoose,
  initialQuery = '',
}: {
  onChoose: (context: NaviContext) => void | Promise<void>;
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery),
    [results, setResults] = useState<NaviWebResult[]>([]),
    [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>(
      'idle',
    );
  const abort = useRef<AbortController | null>(null);
  const [choosing, setChoosing] = useState(false);
  async function choose(result: NaviWebResult) {
    if (choosing) return;
    setChoosing(true);
    try {
      await onChoose(naviWebContext(result));
    } catch {
      setState('error');
    } finally {
      setChoosing(false);
    }
  }
  useEffect(() => () => abort.current?.abort(), []);
  async function search() {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setState('loading');
    setResults([]);
    try {
      const found = await searchNaviWebSources(
        query,
        i18n.resolvedLanguage ?? 'en',
        controller.signal,
      );
      if (!controller.signal.aborted) {
        setResults(found);
        setState('ready');
      }
    } catch {
      if (!controller.signal.aborted) setState('error');
    }
  }
  return (
    <section className="navi-web-search">
      <h3>{t('title')}</h3>
      <p>{t('scope')}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <label>
          {t('query')}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={120}
            required
            disabled={state === 'loading'}
          />
        </label>
        <small>{t('privacy')}</small>
        <button type="submit" disabled={!query.trim() || state === 'loading'}>
          {t(state === 'loading' ? 'loading' : 'search')}
        </button>
      </form>
      {state === 'error' && <p role="alert">{t('error')}</p>}
      {state === 'ready' && !results.length && (
        <p role="status">{t('empty')}</p>
      )}
      <ul>
        {results.map((r) => (
          <li key={r.pageId}>
            <h4>
              <a href={r.url} target="_blank" rel="noopener noreferrer">
                {r.title}
              </a>
            </h4>
            <p>{r.text.slice(0, 350)}…</p>
            <small>Wikipedia · {r.revision} · CC BY-SA</small>
            <button
              type="button"
              disabled={choosing}
              onClick={() => void choose(r)}
            >
              {t('use')}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
