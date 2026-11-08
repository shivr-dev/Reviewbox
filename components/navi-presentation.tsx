'use client';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Compass } from 'lucide-react';

/** Keep Navi outside transformed/overflow-clipped page and game containers. */
export function NaviLayer({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? createPortal(children, document.body) : null;
}

/** A non-modal top-layer surface. Other pages remain usable alongside Navi. */
export function NaviSurface({
  children,
  label,
  fullscreen = false,
}: {
  children: ReactNode;
  label: string;
  fullscreen?: boolean;
}) {
  const surface = useRef<HTMLElement>(null);
  const supportsTopLayer =
    typeof HTMLElement !== 'undefined' &&
    typeof HTMLElement.prototype.showPopover === 'function';
  useLayoutEffect(() => {
    if (!fullscreen) return;
    const application = document.querySelector<HTMLElement>(
      '.review-application',
    );
    if (!application) return;
    const previous = application.inert;
    application.inert = true;
    surface.current
      ?.querySelector<HTMLElement>('header button')
      ?.focus({ preventScroll: true });
    return () => {
      application.inert = previous;
    };
  }, [fullscreen]);
  useLayoutEffect(() => {
    const node = surface.current;
    const previous = document.activeElement;
    if (supportsTopLayer && node?.isConnected) node.showPopover();
    return () => {
      if (supportsTopLayer && node?.matches(':popover-open'))
        node.hidePopover();
      if (
        previous instanceof HTMLElement &&
        previous.isConnected &&
        (!document.activeElement ||
          document.activeElement === document.body ||
          node?.contains(document.activeElement))
      ) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [supportsTopLayer]);
  return (
    <aside
      ref={surface}
      id="navi-workspace"
      className="navi-workspace navi-conversation"
      data-mode={fullscreen ? 'fullscreen' : 'docked'}
      popover={supportsTopLayer ? 'manual' : undefined}
      aria-label={label}
    >
      {children}
    </aside>
  );
}

/** Indicates actual request activity; never invents reasoning steps or a percentage. */
export function NaviActivity({ label }: { label: string }) {
  return (
    <div
      className="navi-activity"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="navi-activity-mark" aria-hidden="true">
        <span className="navi-activity-orbit" />
        <Compass size={18} />
      </span>
      <span className="navi-activity-copy">
        {label}
        <span className="navi-activity-wave" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </span>
    </div>
  );
}
