'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDownToLine, ArrowLeft, ArrowRight, BookOpen, Search, SlidersHorizontal, X } from 'lucide-react';
import { tr } from '@/lib/i18n';
import { SUBJECTS } from '@/lib/model';
import { subjectLabel } from '@/lib/presentation';
import { listCommunity, type CatalogEntry } from '@/lib/community-client';
import { consumeCommunitySearch } from '@/lib/community-navigation';
import { openNaviPublic } from './navi-workspace';
import { useReview } from './review-context';
import { Dialog, DialogContent, DialogTitle } from './ui/dialog';

const t = (key: string, options?: Record<string, unknown>) => tr('library:community.' + key, options);
const extraFilters = {
  grade: null,
  curriculum: null,
  language: ['zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'es', 'fr', 'ru'],
  exam: ['SAT', 'ACT', 'TOEFL', 'MAP', 'AP', 'midterm', 'final'],
  content_type: ['practice', 'review', 'course', 'flashcards', 'mock-exam'],
  difficulty: ['basic', 'medium', 'upper-medium', 'advanced', 'challenge'],
};
type FilterKey = keyof typeof extraFilters;
const extraKeys = Object.keys(extraFilters) as FilterKey[];
const noFilters = { grade: '', curriculum: '', language: '', exam: '', content_type: '', difficulty: '' };
const emptyQuery = { keyword: '', subject: '', sort: 'updated', ...noFilters };
const hasId = (value: unknown): value is string => typeof value === 'string' &&
  /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value);

function tags(pack: CatalogEntry) {
  const { subject, grade, curriculum } = pack.metadata;
  return [SUBJECTS.some(item => item.id === subject) ? subjectLabel(subject) : subject, grade, curriculum]
    .filter((value): value is string => typeof value === 'string' && !!value);
}

type Props = {
  detailId?: string;
  onOpen: (id: string) => void;
  onBack: () => void;
  onInstall: (id: string) => void;
  busy: boolean;
  list?: typeof listCommunity;
};

export default function CommunityCatalog({ detailId, onOpen, onBack, onInstall, busy, list = listCommunity }: Props) {
  useTranslation();
  const { data, cloudUser, navigate } = useReview();
  const [query, setQuery] = useState(() => ({ ...emptyQuery, ...consumeCommunitySearch() }));
  const [draft, setDraft] = useState<typeof noFilters | null>(null);
  const [rows, setRows] = useState<CatalogEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [remoteDetail, setRemoteDetail] = useState<{ id: string; entry?: CatalogEntry; error?: boolean }>();
  const [detailRetry, setDetailRetry] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const installed = useMemo(() => data.packs
    .map(pack => (pack as { publicId?: string }).publicId)
    .filter(hasId).slice(0, 200), [data.packs]);
  const detail = rows.find(pack => pack.id === detailId) ?? (remoteDetail?.id === detailId ? remoteDetail?.entry : undefined);
  const selectedFilters = extraKeys.filter(key => query[key]);
  const hasFilters = !!(query.keyword || query.subject || selectedFilters.length);

  const load = useCallback(async (next?: string) => {
    controller.current?.abort();
    const run = new AbortController();
    controller.current = run;
    setLoading(true);
    setError(false);
    try {
      const page = await list({ ...query, installed, ...(next ? { cursor: next } : {}) }, run.signal);
      if (run.signal.aborted) return;
      setRows(previous => next ? [...previous, ...page.packs.filter(pack => !previous.some(row => row.id === pack.id))] : page.packs);
      setCursor(page.cursor);
    } catch {
      if (!run.signal.aborted) setError(true);
    } finally {
      if (!run.signal.aborted) setLoading(false);
    }
  }, [list, query, installed]);

  useEffect(() => {
    setLoading(true);
    setError(false);
    setCursor(null);
    setRows([]);
    const timer = window.setTimeout(() => void load(), 250);
    return () => {
      window.clearTimeout(timer);
      controller.current?.abort();
    };
  }, [load]);

  useEffect(() => {
    if (!detailId || detail || !hasId(detailId)) return;
    const run = new AbortController();
    setRemoteDetail(undefined);
    void list({ id: detailId }, run.signal).then(
      page => {
        if (!run.signal.aborted) setRemoteDetail({ id: detailId, entry: page.packs.find(pack => pack.id === detailId) });
      },
      () => { if (!run.signal.aborted) setRemoteDetail({ id: detailId, error: true }); },
    );
    return () => run.abort();
  }, [detailId, detail, detailRetry, list]);

  useEffect(() => {
    if (detailId && detail) titleRef.current?.focus({ preventScroll: true });
  }, [detail, detailId]);

  useEffect(() => {
    const handler = (event: Event) => {
      const value = (event as CustomEvent).detail;
      if (typeof value?.keyword !== 'string') return;
      consumeCommunitySearch();
      setQuery({ ...emptyQuery, keyword: value.keyword.slice(0, 120), subject: typeof value.subject === 'string' ? value.subject : '' });
      if (detailId) onBack();
    };
    window.addEventListener('review:community-search', handler);
    return () => window.removeEventListener('review:community-search', handler);
  }, [detailId, onBack]);

  if (detailId) {
    const result = remoteDetail?.id === detailId ? remoteDetail : undefined;
    return <section className="rb-community-detail">
      <button type="button" className="rb-community-back" onClick={onBack}><ArrowLeft size={17} />{t('title')}</button>
      {!detail ? <div className="rb-community-state" role={result?.error ? 'alert' : 'status'}>
        {result?.error ? <>
          <p>{t('unavailable')}</p><button type="button" className="secondary" onClick={() => setDetailRetry(value => value + 1)}>{t('retry')}</button>
        </> : <p>{result || !hasId(detailId) ? tr('library:packNotFound') : t('loading')}</p>}
      </div> : <>
        <header className="rb-community-detail-heading">
          <div className="rb-community-tags">{tags(detail).map((tag, index) => <span key={index}>{tag}</span>)}</div>
          <h1 ref={titleRef} tabIndex={-1}>{detail.title}</h1>
          {typeof detail.metadata.author_display_name === 'string' && <p>{detail.metadata.author_display_name}</p>}
        </header>
        <div className="rb-community-detail-grid">
          <section className="rb-community-description">
            <h2>{tr('library:内容介绍')}</h2>
            <p>{detail.description || t('unspecified')}</p>
          </section>
          <aside className="rb-community-pack-facts">
            <div className="rb-community-pack-count">
              <BookOpen size={21} aria-hidden="true" />
              <strong>{tr('common:{{v0}} 题', { v0: detail.question_count })}</strong>
              <span>v{detail.version}</span>
            </div>
            <dl>
              <div><dt>{t('verification')}</dt><dd>{t('notVerified')}</dd></div>
              <div><dt>{t('explanations')}</dt><dd>{Math.round((detail.metadata.explanation_coverage ?? 0) * 100)}%</dd></div>
              <div><dt>{t('license')}</dt><dd>{detail.metadata.license_declaration || t('unspecified')}</dd></div>
            </dl>
            <button type="button" className="primary" disabled={busy} onClick={() => cloudUser ? onInstall(detail.id) : navigate('you', 'all', 'account')}>
              <ArrowDownToLine size={17} />{busy ? t('loading') : cloudUser
                ? installed.includes(detail.id) ? tr('library:查看更新') : tr('library:查看与安装') : t('loginInstall')}
            </button>
            <button type="button" className="rb-community-back" onClick={() => openNaviPublic(detail.id)}>Navi<ArrowRight size={15} /></button>
          </aside>
        </div>
      </>}
    </section>;
  }

  return <div className="rb-community-catalog">
    <div className="rb-community-toolbar" role="search" aria-label={t('search')}>
      <label className="rb-community-search">
        <Search size={21} aria-hidden="true" />
        <input type="search" value={query.keyword} maxLength={120} aria-label={t('search')} placeholder={t('search')}
          onChange={event => setQuery({ ...query, keyword: event.target.value })} />
      </label>
      <select aria-label={t('subject')} value={query.subject} onChange={event => setQuery({ ...query, subject: event.target.value })}>
        <option value="">{t('subject')}</option>
        {SUBJECTS.map(item => <option key={item.id} value={item.id}>{subjectLabel(item.id)}</option>)}
      </select>
      <select aria-label={t('sort')} value={query.sort} onChange={event => setQuery({ ...query, sort: event.target.value })}>
        {['updated', 'published', 'name', 'installed'].map(value => <option key={value} value={value}>{t('sort.' + value)}</option>)}
      </select>
      <button ref={filterButtonRef} type="button" className="rb-community-filter" aria-haspopup="dialog" data-filtered={selectedFilters.length > 0 || undefined}
        onClick={() => setDraft({ ...noFilters, ...Object.fromEntries(extraKeys.map(key => [key, query[key]])) })}>
        <SlidersHorizontal size={18} />{t('filters')}{selectedFilters.length > 0 && <span>{selectedFilters.length}</span>}
      </button>
    </div>
    {selectedFilters.length > 0 && <div className="rb-community-applied">
      {selectedFilters.map(key => <button type="button" key={key} onClick={() => setQuery({ ...query, [key]: '' })}>
        {t(key)} · {extraFilters[key] ? t('value.' + query[key]) : query[key]}<X size={15} />
      </button>)}
    </div>}
    <Dialog open={!!draft} onOpenChange={open => { if (!open) setDraft(null); }}>
      <DialogContent className="rb-community-filter-dialog" aria-describedby={undefined} finalFocus={filterButtonRef}>
        <DialogTitle>{t('filters')}</DialogTitle>
        {draft && <form onSubmit={event => { event.preventDefault(); setQuery({ ...query, ...draft }); setDraft(null); }}>
          <div className="rb-community-fields">{extraKeys.map(key => {
            const values = extraFilters[key];
            return <label key={key}><span>{t(key)}</span>{values ?
              <select value={draft[key]} onChange={event => setDraft({ ...draft, [key]: event.target.value })}>
                <option value="">{t('any')}</option>
                {values.map(value => <option key={value} value={value}>{t('value.' + value)}</option>)}
              </select> :
              <input value={draft[key]} maxLength={key === 'grade' ? 50 : 100} placeholder={t('any')}
                onChange={event => setDraft({ ...draft, [key]: event.target.value })} />}
            </label>;
          })}</div>
          <div className="button-row">
            <button type="button" className="rb-community-back" onClick={() => setDraft(noFilters)}>{t('clearFilters')}</button>
            <button type="submit" className="primary">{t('applyFilters')}</button>
          </div>
        </form>}
      </DialogContent>
    </Dialog>
    <div className="rb-community-list" aria-busy={loading}>
      {loading && !rows.length && <div className="rb-community-state" role="status">{t('loading')}</div>}
      {!loading && !error && !rows.length && <div className="rb-community-state" role="status">
          <BookOpen size={27} aria-hidden="true" /><p>{t('empty')}</p>
          {hasFilters && <button type="button" className="secondary" onClick={() => setQuery({ ...emptyQuery, sort: query.sort })}>{t('clearFilters')}</button>}
        </div>}
      {rows.map(pack => {
          const subject = SUBJECTS.find(item => item.id === pack.metadata.subject);
          const packTags = tags(pack);
          return <button type="button" className="rb-community-entry" onClick={() => onOpen(pack.id)} key={pack.id}>
            <span className="rb-community-entry-icon" style={subject ? { color: subject.color } : undefined}><BookOpen size={23} aria-hidden="true" /></span>
            <span className="rb-community-entry-text">
              <span className="rb-community-entry-title">{pack.title}</span>
              {pack.description && <span className="rb-community-entry-description">{pack.description}</span>}
              {packTags.length > 0 && <span className="rb-community-entry-tags">{packTags.join(' · ')}</span>}
            </span>
            <span className="rb-community-entry-meta">
              <strong>{tr('common:{{v0}} 题', { v0: pack.question_count })}</strong>
              <span>{installed.includes(pack.id) ? tr('library:已安装') : 'v' + pack.version}</span>
            </span>
            <ArrowRight className="rb-community-entry-arrow" size={20} aria-hidden="true" />
          </button>;
        })}
      {error && <div className="rb-community-state" role="alert">
        <p>{t('unavailable')}</p><button type="button" className="secondary" onClick={() => void load(cursor ?? undefined)}>{t('retry')}</button>
      </div>}
    </div>
    {cursor && !error && <div className="pack-pagination"><button type="button" className="secondary" disabled={loading}
      onClick={() => void load(cursor)}>{loading ? t('loading') : t('more')}</button></div>}
  </div>;
}
