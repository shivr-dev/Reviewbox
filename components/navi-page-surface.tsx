'use client';

import { useEffect, useMemo, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { NaviUIController, type WorkspaceLayout } from '@/lib/navi-ui';
import { registerNaviPluginSurface } from '@/lib/navi-local-plugins';

export function naviReadingStyle(layout: WorkspaceLayout) {
  return layout.fontSize === 18 ? undefined : { '--navi-reading-size': layout.fontSize + 'px' } as CSSProperties;
}

/** Provides reading controls when a specialized controller is absent. */
export default function NaviPageSurface({ page, scope, enabled, children }: {
  page: string;
  scope: string;
  enabled: boolean;
  children: ReactNode;
}) {
  const controller = useMemo(() => new NaviUIController({
    panels: [], questionIds: [], molecule: false, protected: !enabled, pagePresentation: true,
  }), [scope, enabled]);
  useEffect(() => enabled ? registerNaviPluginSurface(controller, scope, -10) : undefined, [controller, enabled, scope]);
  const layout = useSyncExternalStore(controller.subscribe, controller.snapshot, controller.snapshot);
  return (
    <div className="review-application navi-reading-surface" data-page={page}
      data-navi-reading-mode={layout.mode} style={naviReadingStyle(layout)}>
      {children}
    </div>
  );
}
