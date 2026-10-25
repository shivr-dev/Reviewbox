'use client';
import { useEffect, useRef, useState } from 'react';
import { Watch, RefreshCw, Check, Unlink, Clock } from 'lucide-react';
import { watchRequest } from '@/lib/watch-client';
import { currentNamespace } from '@/lib/store';
import { awaitingWatch, watchPairingMessage, type WatchDevice, type WatchPairing } from '@/lib/watch-device-state';

export default function WatchDeviceManager({ request = watchRequest }: { request?: typeof watchRequest }) {
  const [devices, setDevices] = useState<WatchDevice[]>([]);
  const [pairings, setPairings] = useState<WatchPairing[]>([]);
  const [code, setCode] = useState('');
  const [inspection, setInspection] = useState<WatchPairing | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [confirm, setConfirm] = useState<WatchDevice | null>(null);
  const namespace = useRef(currentNamespace());
  const mounted = useRef(false);
  const working = useRef(false);
  const alive = () => mounted.current && currentNamespace() === namespace.current;

  const reload = async () => {
    const result = await request('list');
    if (!alive()) return;
    setDevices((result.devices ?? []).filter((d: WatchDevice) => !d.revokedAt)); setPairings(result.pairings ?? []);
    setLoaded(true); setNow(Date.now());
  };
  const act = async (id: string, work: () => Promise<void>, background = false) => {
    if (working.current || !alive()) return;
    working.current = true;
    if (!background) { setBusy(id); setError(''); }
    try { await work(); }
    catch (e) { if (alive()) setError(e instanceof Error ? e.message : '连接失败，请重试'); }
    finally { working.current = false; if (alive()) setBusy(''); }
  };
  useEffect(() => {
    mounted.current = true;
    void act('load', reload);
    return () => { mounted.current = false; };
  }, []);
  // Only wait for a real pending claim, while this page is visible.
  useEffect(() => {
    if (!pairings.some(p => awaitingWatch(p, now))) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      setNow(Date.now()); void act('load', reload, true);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [pairings, now]);
  const approve = () => act('approve', async () => {
    const approved = await request('approve', { code });
    if (!alive()) return;
    const p = { ...inspection!, ...approved, id: approved.pairingId ?? inspection!.id };
    setPairings(old => [p, ...old.filter(x => x.id !== p.id)]);
    setInspection(null); setCode('');
    setNotice('授权已保存。手表完成连接后，会自动出现在下方。');
    await reload(); // Keep the pending row if refresh fails after authorization succeeds.
  });
  return <>
    <section className="panel watch-pairing"><h2>连接新手表</h2><p>输入手表上显示的八位配对码，再确认设备授权。</p>
      <form onSubmit={e => { e.preventDefault(); void act('inspect', async () => {
        const result = await request('inspect', { code }); if (alive()) setInspection(result);
      }); }}>
        <label htmlFor="watch-code">配对码</label><div><input id="watch-code" value={code} disabled={!!busy} onChange={e => { setCode(e.target.value.toUpperCase()); setInspection(null); }} placeholder="ABCD EFGH" autoComplete="off" maxLength={9}/><button className="primary" disabled={!!busy || code.replace(/[ -]/g, '').length !== 8}>{busy === 'inspect' ? '核对中…' : '核对设备'}</button></div>
      </form>
      {inspection && <div className="watch-approval" role="region" aria-label="确认设备授权"><h3>允许这台设备访问账户？</h3><strong>{inspection.name}</strong><p>{inspection.platform}</p><p>授权后可同步学习记录、资料和真实成绩。请确认配对码来自你手边的设备。</p><button className="primary" disabled={!!busy} onClick={() => void approve()}><Check/>{busy === 'approve' ? '授权中…' : '确认授权'}</button><button className="secondary" disabled={!!busy} onClick={() => void act('deny', async () => { await request('deny', { code }); if (alive()) setInspection(null); })}>拒绝</button></div>}
    </section>
    {pairings.length > 0 && <section className="panel watch-pending" aria-label="待完成的配对"><h2>配对进度</h2>
      {pairings.map(p => <article className="watch-device-row" key={p.id}><Clock/><div><h3>{p.name} · {awaitingWatch(p, now) ? '等待手表连接' : '配对已过期'}</h3><p>{p.platform}</p><p role="status">{watchPairingMessage(p, now)}</p></div><button className="secondary" disabled={!!busy} onClick={() => void act('cancel', async () => { await request('cancel-pairing', { deviceId: p.id }); await reload(); if (alive()) setNotice('已取消这次配对授权。'); })}>取消配对</button></article>)}
    </section>}
    <section className="panel"><div className="watch-section-title"><h2>已连接设备</h2><button className="text-button" disabled={!!busy} onClick={() => void act('load', reload)}><RefreshCw/>{busy === 'load' ? '刷新中…' : '刷新'}</button></div>
      {!loaded ? <p role="status">正在读取设备…</p> : !devices.length && <p className="muted">{pairings.some(p => awaitingWatch(p, now)) ? '手表完成连接后会显示在这里，无需再次授权。' : '还没有连接的手表。'}</p>}
      {devices.map(d => <article key={d.id} className="watch-device-row"><Watch/><div><h3>{d.name} <small>已连接</small></h3><p>{d.platform}</p><p className="muted">最近连接：{new Date(d.lastSeen).toLocaleString()}</p>
        <details><summary>同步记录</summary>{d.history.length ? d.history.map((h, i) => <p key={i}>{new Date(h.at).toLocaleString()} · 上传 {h.uploaded} · 下载 {h.downloaded}</p>) : <p>尚无同步记录。</p>}</details>
        {!d.revokedAt && <label><input type="checkbox" checked={d.notifications} disabled={!!busy} onChange={e => { const enabled = e.target.checked; void act('notifications', async () => { await request('notifications', { deviceId: d.id, enabled }); await reload(); }); }}/>允许学习提醒（设备支持并授权时生效）</label>}
      </div>{!d.revokedAt && <button className="secondary" disabled={!!busy} onClick={() => setConfirm(d)}><Unlink/>解绑</button>}</article>)}
      {confirm && <div className="watch-approval" role="alertdialog" aria-labelledby="watch-revoke-title"><h3 id="watch-revoke-title">解绑 {confirm.name}？</h3><p>设备凭证会立即失效。已同步的学习历史保留，尚未上传的内容需先在手表同步。</p><button className="danger" disabled={!!busy} onClick={() => void act('revoke', async () => { await request('revoke', { deviceId: confirm.id }); if (!alive()) return; setDevices(old => old.filter(d => d.id !== confirm.id)); setConfirm(null); setNotice('已解绑。手表联网检测后会退出账户。'); await reload(); })}>{busy === 'revoke' ? '解绑中…' : '确认解绑'}</button><button className="secondary" disabled={!!busy} onClick={() => setConfirm(null)}>取消</button></div>}
    </section>
    {error && <p role="alert" className="watch-error">{error}<button className="text-button" disabled={!!busy} onClick={() => void act('load', reload)}>重试</button></p>}
    {notice && <p role="status">{notice}</p>}
  </>;
}
