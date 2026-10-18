import { createRoot } from 'react-dom/client';
import Workspace from '../app/workspace';
import DeploymentStatus from '../components/deployment-status';
import { pagesApi } from '../lib/pages-cloud';
import '../app/product-styles';
(window as any).__REVIEW_STATIC__ = true;
(window as any).__REVIEW_PAGES_API__ = pagesApi;
(window as any).__REVIEW_BUILD_SHA__ =
  (import.meta as any).env.VITE_REVIEW_SHA || 'local';
createRoot(document.getElementById('root')!).render(
  <>
    <DeploymentStatus />
    <Workspace />
  </>,
);
