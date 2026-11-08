'use client';
import { useEffect, useState } from 'react';
import { Compass } from 'lucide-react';
import { tr } from '@/lib/i18n';
import { currentNaviUI } from '@/lib/navi-ui';
import { parseWorkspaceRoute } from '@/lib/workspace-route';
import type { NaviTarget } from '@/lib/navi-context';

type Selection = { text: string; target: NaviTarget; x: number; y: number };
/** Read only a deliberate text selection in the learning canvas, never form fields or exam content. */
export default function NaviSelectionEntry({
  onChoose,
}: {
  onChoose: (target: NaviTarget) => void;
}) {
  const [selected, setSelected] = useState<Selection | null>(null);
  useEffect(() => {
    const read = () => {
      const selection = window.getSelection(),
        live = currentNaviUI(),
        route = parseWorkspaceRoute(window.location.hash);
      if (
        !selection ||
        selection.isCollapsed ||
        !selection.rangeCount ||
        live?.capabilities.protected ||
        ['exam', 'assessment', 'onboarding'].includes(route.page)
      ) {
        setSelected(null);
        return;
      }
      const range = selection.getRangeAt(0),
        node = range.commonAncestorContainer,
        element = node instanceof Element ? node : node.parentElement;
      const app = document.querySelector('.review-application');
      if (
        !app?.contains(node) ||
        !app.contains(range.startContainer) ||
        !app.contains(range.endContainer) ||
        element?.closest('input,textarea,select,[contenteditable="true"]')
      ) {
        setSelected(null);
        return;
      }
      const text = selection.toString().trim().slice(0, 1800);
      const target: NaviTarget | undefined =
        live?.target ??
        (['home', 'plan'].includes(route.page)
          ? { type: 'plan', id: 'current' }
          : undefined);
      if (!text || !target) {
        setSelected(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      setSelected({
        text,
        target,
        x: Math.max(12, Math.min(window.innerWidth - 160, rect.left)),
        y: Math.max(12, Math.min(window.innerHeight - 52, rect.bottom + 8)),
      });
    };
    const clear = () => setSelected(null);
    document.addEventListener('pointerup', read);
    document.addEventListener('keyup', read);
    window.addEventListener('hashchange', clear);
    window.addEventListener('scroll', clear, true);
    return () => {
      document.removeEventListener('pointerup', read);
      document.removeEventListener('keyup', read);
      window.removeEventListener('hashchange', clear);
      window.removeEventListener('scroll', clear, true);
    };
  }, []);
  if (!selected) return null;
  return (
    <button
      className="navi-selection-entry"
      type="button"
      style={{ left: selected.x, top: selected.y }}
      onPointerDown={(e) => e.preventDefault()}
      onClick={() => {
        onChoose({ ...selected.target, selectedText: selected.text });
        setSelected(null);
      }}
    >
      <Compass size={15} />
      {tr('study:navi.selection.ask')}
    </button>
  );
}
