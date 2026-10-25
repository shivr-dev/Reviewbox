import { createRoot } from 'react-dom/client';
import Workspace from '../app/workspace';
import WatchDownload from '../components/watch-download';
import {isWatchBrowser} from '../lib/watch-platform';
import DeploymentStatus from '../components/deployment-status';
import { pagesApi } from '../lib/pages-cloud';
import '../app/product-styles.css';
(window as any).__REVIEW_STATIC__ = true;
(window as any).__REVIEW_PAGES_API__ = pagesApi;
(window as any).__REVIEW_BUILD_SHA__ =
  (import.meta as any).env.VITE_REVIEW_SHA || 'local';
const watch=isWatchBrowser({userAgent:navigator.userAgent,screenWidth:window.screen.width,screenHeight:window.screen.height,coarsePointer:window.matchMedia('(pointer:coarse)').matches,search:location.search});
if(!(window as any).__REVIEW_WATCH_STATIC__)createRoot(document.getElementById('root')!).render(watch?<WatchDownload/>:
  <>
    <DeploymentStatus />
    <Workspace />
  </>,
);
