'use client';
import { useEffect, useState } from 'react';
import { assetPath } from '@/lib/runtime';

type Notice = { runId: number; state: 'building' | 'publishing' | 'failed' };
const runsURL = 'https://api.github.com/repos/shivr-dev/Reviewbox/actions/workflows/pages.yml/runs?per_page=1&branch=main';

export default function DeploymentStatus() {
  const [notice, setNotice] = useState<Notice | null>(null);
  useEffect(() => {
    if (location.hostname !== 'shivr-dev.github.io') return;
    let alive = true;
    const check = async () => {
      try {
        const response = await fetch(runsURL, {headers:{Accept:'application/vnd.github+json'},cache:'no-store'});
        if (!response.ok) return;
        const run = ((await response.json()) as any).workflow_runs?.[0];
        if (!alive || !run || !Number.isSafeInteger(run.id)) return;
        if (sessionStorage.getItem('review-dismissed-run') === String(run.id)) {
          setNotice(null); return;
        }
        const current = (window as any).__REVIEW_BUILD_SHA__;
        if (run.status !== 'completed') {
          setNotice({runId:run.id,state:'building'});
        } else if (run.conclusion === 'success' && current !== run.head_sha) {
          const marker = await fetch(assetPath('version.json') + '?t=' + Date.now(), {cache:'no-store'});
          if (!alive || !marker.ok) return;
          const version = (await marker.json()) as {commit?:string};
          if (version.commit === run.head_sha) location.reload();
          else setNotice({runId:run.id,state:'publishing'});
        } else if (run.conclusion !== 'success' && current !== run.head_sha) {
          setNotice({runId:run.id,state:'failed'});
        } else setNotice(null);
      } catch {
        // A rate-limited or unavailable status API must never block studying.
      }
    };
    void check();
    const interval = setInterval(() => void check(), 75000);
    return () => { alive=false; clearInterval(interval); };
  }, []);
  if (!notice) return null;
  const waiting = notice.state !== 'failed';
  return <div className="pages-deploy-scrim" role={waiting ? 'status' : 'alert'}>
    <section className="pages-deploy-card">
      {waiting && <div className="pages-deploy-spinner" aria-hidden="true" />}
      <p className="eyebrow">REVIEWBOX UPDATE</p>
      <h2>{waiting ? '请稍等' : '本次更新未完成'}</h2>
      <p>{notice.state === 'building' ? '新版本正在构建和发布。完成后页面会自动更新。' : notice.state === 'publishing' ? '构建已完成，正在等待网页文件生效。' : '你仍可使用当前版本；请稍后检查 GitHub Actions。'}</p>
      <button onClick={() => {
        sessionStorage.setItem('review-dismissed-run', String(notice.runId));
        setNotice(null);
      }}>{waiting ? '继续使用当前版本' : '关闭提示'}</button>
    </section>
  </div>;
}
