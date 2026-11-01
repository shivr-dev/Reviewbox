'use client';
import {tr} from '@/lib/i18n';
import {useEffect,useState} from 'react';
import {assetPath} from '@/lib/runtime';
import {validWatchRelease,type WatchRelease} from '@/lib/watch-platform';
export default function WatchDownload() {
  const [release,setRelease]=useState<WatchRelease|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
  useEffect(()=>{const controller=new AbortController();void fetch(assetPath('watch-release.json'),{cache:'no-store',signal:controller.signal}).then(async r=>{if(!r.ok)throw new Error();const value=await r.json();if(!validWatchRelease(value))throw new Error();setRelease(value);}).catch(()=>{if(!controller.signal.aborted)setError(tr("devices:手表版正在验证，下载暂未开放。"));}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[]);
  return <main className="watch-download-page"><img src={assetPath('learning-penguin.png')} alt="企鹅伙伴"/><h1>Reviewbox Watch</h1><p>{release?`${release.version} · Android ${release.minimumAndroid}+`:'OPPO Watch X · OWW231'}</p>
    {release?<a className="watch-download-button" href={release.url} download rel="noopener">{tr("devices:下载手表版 APK")}</a>:<button className="watch-download-button" disabled>{loading?tr("devices:正在检查版本…"):tr("devices:手表版准备中")}</button>}
    {error&&<p role="status">{error}</p>}
  </main>;
}
