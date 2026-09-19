import { createRoot } from 'react-dom/client';
import Workspace from '../app/workspace';
import 'katex/dist/katex.min.css';
import '../app/globals.css';
import '../app/upgrade.css';
import '../app/courses.css';
import '../app/exam-import.css';
(window as any).__REVIEW_STATIC__ = true;
createRoot(document.getElementById('root')!).render(<Workspace />);
