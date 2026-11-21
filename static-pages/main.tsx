import { createRoot } from 'react-dom/client';
import AppEntry from '../components/app-entry';
import WatchDownload from '../components/watch-download';
import {isWatchBrowser} from '../lib/watch-platform';
import DeploymentStatus from '../components/deployment-status';
import 'katex/dist/katex.min.css';
import '../app/product-styles.css';
(window as any).__REVIEW_STATIC__ = true;
(window as any).__REVIEW_PAGES_API__ = async (path: string, init?: RequestInit) =>
  (await import('../lib/pages-cloud')).pagesApi(path, init);
(window as any).__REVIEW_BUILD_SHA__ =
  (import.meta as any).env.VITE_REVIEW_SHA || 'local';
const watch=isWatchBrowser({userAgent:navigator.userAgent,screenWidth:window.screen.width,screenHeight:window.screen.height,coarsePointer:window.matchMedia('(pointer:coarse)').matches,search:location.search});
if(!(window as any).__REVIEW_WATCH_STATIC__)createRoot(document.getElementById('root')!).render(watch?<WatchDownload/>:
  <>
    <DeploymentStatus />
    <AppEntry />
  </>,
);
