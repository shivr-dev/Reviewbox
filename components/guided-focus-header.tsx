import type { ReactNode } from 'react';
import { ChevronLeft, X } from 'lucide-react';
import { tr } from '@/lib/i18n';
import { Progress } from '@/components/ui/progress';

export default function GuidedFocusHeader({
  onExit, exitLabel, progress, progressLabel, position, onBack, busy, children,
}: {
  onExit: () => void;
  exitLabel: string;
  progress: number;
  progressLabel: string;
  position: string;
  onBack?: () => void;
  busy?: boolean;
  children?: ReactNode;
}) {
  return (
    <header className="guided-progress-header">
      <div className="guided-header-nav">
        <button type="button" className="quiet guided-exit" onClick={onExit} disabled={busy}
          aria-label={exitLabel} title={exitLabel}><X size={23} /></button>
        {onBack && <button type="button" className="quiet guided-back" onClick={onBack} disabled={busy}
          aria-label={tr('study:上一步')} title={tr('study:上一步')}><ChevronLeft size={20} /></button>}
      </div>
      <div className="guided-progress">
        <Progress value={progress} aria-label={progressLabel} />
        <span>{position}</span>
      </div>
      <div className="guided-header-actions">
        {children}
        <span className="guided-wordmark" lang="en">Reviewbox<span aria-hidden="true">.</span></span>
      </div>
    </header>
  );
}
