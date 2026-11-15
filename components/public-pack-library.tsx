'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, PackageOpen, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { listCommunity } from '@/lib/community-client';
import { tr } from '@/lib/i18n';
import { watchRequest } from '@/lib/watch-client';
import { validatePack } from '@/lib/importer';
import { preparePublicPack } from '@/lib/public-pack';
import { installedWatchPackage } from '@/lib/watch-package';
import { currentNamespace } from '@/lib/store';
import { parseWorkspaceRoute } from '@/lib/workspace-route';
import type { Pack } from '@/lib/model';
import CommunityCatalog from './community-catalog';
import PackUpdateReview from './pack-update-review';
import { useReview } from './review-context';

type Entry = { id: string; title: string; version: string; question_count: number };
type Route = { section: string; id?: string };

const t = (key: string) => tr('library:community.' + key);

export default function PublicPackLibrary({
  request = watchRequest, catalogRequest = listCommunity, embedded = false,
}: { request?: typeof watchRequest; catalogRequest?: typeof listCommunity; embedded?: boolean }) {
  useTranslation();
  const { cloudUser, section, subject, navigate } = useReview();
  const owner = cloudUser?.id;
  const [localRoute, setLocalRoute] = useState<Route>({ section: 'discover' });
  const [, setRouteRevision] = useState(0);
  const [installing, setInstalling] = useState<{ owner: string; id: string; pack: Pack } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requestRun = useRef(0);
  const routeSection = embedded ? section : localRoute.section;
  const publishing = routeSection === 'discover-publish';
  const hash = typeof window === 'undefined' ? '' : window.location.hash;
  const detailId = publishing ? undefined : embedded ? parseWorkspaceRoute(hash).target : localRoute.id;

  useEffect(() => {
    function syncAddress() { setRouteRevision(value => value + 1); }
    function focusSource(event: Event) {
      const value = (event as CustomEvent).detail;
      if (value?.type !== 'pack' || typeof value.id !== 'string') return;
      if (embedded) syncAddress();
      else setLocalRoute({ section: 'discover-pack', id: value.id });
    }
    window.addEventListener('hashchange', syncAddress);
    window.addEventListener('review:focus-source', focusSource);
    return () => {
      window.removeEventListener('hashchange', syncAddress);
      window.removeEventListener('review:focus-source', focusSource);
    };
  }, [embedded]);

  useEffect(() => {
    setInstalling(null);
    setError('');
    setBusy(false);
    return () => { requestRun.current++; };
  }, [owner, detailId, publishing]);

  const go = useCallback((section: string, id?: string) => {
    if (embedded) {
      navigate('subjects', subject, section, id);
      setRouteRevision(value => value + 1);
    } else setLocalRoute({ section, id });
  }, [embedded, navigate, subject]);
  const browse = useCallback(() => go('discover'), [go]);

  async function openInstall(id: string) {
    if (!owner) return;
    const run = ++requestRun.current;
    const ns = currentNamespace();
    const current = () => requestRun.current === run && currentNamespace() === ns;
    setBusy(true);
    setError('');
    try {
      const result = await request('pack-get', { id });
      if (!current()) return;
      const pack = validatePack(result.pack);
      const manifest = { ...pack.manifest, publicId: id };
      setInstalling({ owner, id, pack: { ...pack, manifest } });
    } catch (cause) {
      if (current()) setError((cause as Error).message);
    } finally {
      if (current()) setBusy(false);
    }
  }

  const preview = installing?.owner === owner && installing?.id === detailId ? installing?.pack : undefined;
  return <section className="rb-community" aria-label={t('title')}>
    {!publishing && !detailId && <header className="rb-community-masthead">
      {embedded && <button type="button" className="rb-community-back" onClick={() => navigate('subjects', subject, 'packs')}>
        <ArrowLeft size={17} />{tr('common:我的学习包')}
      </button>}
      <div className="rb-community-heading-row">
        <h1>{t('title')}</h1>
        {owner && <button type="button" className="secondary" onClick={() => go('discover-publish')}>
          <Upload size={17} />{t('publishManage')}
        </button>}
      </div>
    </header>}
    {error && !publishing && <p role="alert" className="settings-error">{error}</p>}
    <div hidden={publishing || !!preview}>
      <CommunityCatalog list={catalogRequest} detailId={detailId} busy={busy} onBack={browse}
        onOpen={id => go('discover-pack', id)} onInstall={id => void openInstall(id)} />
    </div>
    {preview && <div className="rb-community-install">
      <PackUpdateReview pack={preview} onCancel={() => setInstalling(null)} onDone={() => setInstalling(null)} />
    </div>}
    {publishing && (owner ? <PublishDesk key={owner} request={request} back={browse} /> :
      <div className="rb-community-publish">
        <button type="button" className="rb-community-back" onClick={browse}><ArrowLeft size={17} />{t('title')}</button>
        <div className="rb-community-state">
          <button type="button" className="primary" onClick={() => navigate('you', 'all', 'account')}>{tr('common:登录')}</button>
        </div>
      </div>)}
  </section>;
}

function PublishDesk({ request, back }: { request: typeof watchRequest; back: () => void }) {
  const { data, subject, notify, navigate } = useReview();
  const [mine, setMine] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [candidate, setCandidate] = useState<Pack | null>(null);
  const [consent, setConsent] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const active = useRef(false);
  const shareable = data.packs.filter(pack => !['review-core', 'review-framework'].includes(pack.id));

  const load = useCallback(async () => {
    const namespace = currentNamespace();
    const current = () => active.current && currentNamespace() === namespace;
    setLoading(true);
    setError('');
    try {
      const result = await request('pack-list');
      if (current()) setMine(result.mine);
    } catch (cause) {
      if (current()) setError((cause as Error).message);
    } finally {
      if (current()) setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    active.current = true;
    heading.current?.focus({ preventScroll: true });
    void load();
    return () => { active.current = false; };
  }, [load]);

  async function submit(action: string, body: Record<string, unknown>, message: string) {
    const namespace = currentNamespace();
    const current = () => active.current && currentNamespace() === namespace;
    setBusy(true);
    setError('');
    try {
      await request(action, body);
      if (!current()) return;
      setCandidate(null);
      setConsent(false);
      notify(message);
      await load();
    } catch (cause) {
      if (current()) setError((cause as Error).message);
    } finally {
      if (current()) setBusy(false);
    }
  }

  function prepare(id: string) {
    try {
      setCandidate(preparePublicPack(installedWatchPackage(data, id)));
      setConsent(false);
      setError('');
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  return <div className="rb-community-publish">
    <button type="button" className="rb-community-back" onClick={back}><ArrowLeft size={17} />{t('title')}</button>
    <h1 ref={heading} tabIndex={-1}>{t('publishManage')}</h1>
    {error && <p role="alert" className="settings-error">{error}</p>}
    {candidate ? <form className="rb-community-publish-preview" onSubmit={event => {
      event.preventDefault();
      if (consent && !busy) void submit('pack-publish', { pack: candidate }, tr('library:学习包已公开发布'));
    }}>
      <h2>{candidate.manifest.title}</h2>
      <p>{tr('common:{{v0}} 题', { v0: candidate.questions.length })} · v{candidate.manifest.version}</p>
      <p>{tr('library:。将分享知识点、题目及解析，不包含个人记录。').replace(/^[。.] */, '')}</p>
      <label><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />
        {tr('library:我有权分享这些内容，并同意公开给所有用户。')}
      </label>
      <div className="button-row">
        <button type="submit" className="primary" disabled={busy || !consent}>{tr('library:确认公开发布')}</button>
        <button type="button" className="secondary" disabled={busy} onClick={() => setCandidate(null)}>{tr('library:取消')}</button>
      </div>
    </form> : <div className="rb-community-publish-grid">
      <section>
        <h2>{tr('library:发布我的学习包')}</h2>
        {shareable.length ? <div className="rb-community-manage-list">
          {shareable.map(pack => <button type="button" key={pack.id} disabled={busy} onClick={() => prepare(pack.id)}>
            <PackageOpen size={19} /><span>{pack.title}</span><ArrowRight size={17} />
          </button>)}
        </div> : <div className="rb-community-state">
          <p>{tr('library:你的学习包会出现在这里')}</p>
          <button type="button" className="secondary" onClick={() => navigate('subjects', subject, 'import')}>{tr('library:导入学习包')}</button>
        </div>}
      </section>
      <section>
        <h2>{t('publishedByMe')}</h2>
        {loading ? <p role="status">{t('loading')}</p> : mine.length ? <ul className="rb-community-manage-list">
          {mine.map(pack => <li key={pack.id}>
            <span><strong>{pack.title}</strong><small>v{pack.version}</small></span>
            <button type="button" className="rb-community-back" disabled={busy}
              onClick={() => void submit('pack-withdraw', { id: pack.id }, tr('library:已撤回，已安装副本不受影响'))}>
              {tr('library:撤回发布')}
            </button>
          </li>)}
        </ul> : !error && <p>{t('publishedEmpty')}</p>}
        {!loading && error && <button type="button" className="secondary" onClick={() => void load()} disabled={busy}>{t('retry')}</button>}
      </section>
    </div>}
  </div>;
}
