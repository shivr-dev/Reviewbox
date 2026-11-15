'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { tr } from '@/lib/i18n';

interface ReaderEntry {
  id: string;
  title: ReactNode;
  subtitle?: ReactNode;
}

export default function ResourceReader({
  label, entries, current, open, onOpen, onBack, onRow, controls, pagination, empty, children,
}: {
  label: string;
  entries: ReaderEntry[];
  current?: string;
  open: boolean;
  onOpen: (id: string) => void;
  onBack: () => void;
  onRow: (id: string, element: HTMLButtonElement | null) => void;
  controls: ReactNode;
  pagination?: ReactNode;
  empty: ReactNode;
  children: ReactNode;
}) {
  const article = useRef<HTMLElement>(null);
  const list = useRef<HTMLElement>(null);
  const entered = useRef(false);
  useEffect(() => {
    if (!window.matchMedia('(max-width: 740px)').matches) return;
    if (open) {
      entered.current = true;
      article.current?.focus({preventScroll:true});
    } else if (entered.current) {
      entered.current = false;
      list.current?.querySelector<HTMLButtonElement>('button[aria-current="true"]')?.focus({preventScroll:true});
    }
  }, [open]);
  return (
    <div className="rb-resource-reader" data-reading={open || undefined} data-empty={!current || undefined}>
      <aside className="rb-reader-index" aria-label={label} ref={list}>
        {controls}
        {entries.length > 0 && (
          <ul className="rb-reader-list">
            {entries.map(entry => <li key={entry.id}>
              <button type="button" ref={el => onRow(entry.id,el)} aria-current={entry.id === current ? 'true' : undefined}
                onClick={() => onOpen(entry.id)}>
                <span><strong>{entry.title}</strong>{entry.subtitle && <small>{entry.subtitle}</small>}</span>
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </li>)}
          </ul>
        )}
        {pagination}
      </aside>
      <article className="rb-reader-document" ref={article} tabIndex={-1}>
        {current ? <>
          <button type="button" className="quiet rb-reader-back" onClick={onBack}>
            <ArrowLeft size={17} aria-hidden="true" />{tr('common:返回')}
          </button>
          <div key={current} className="rb-reader-page">{children}</div>
        </> : empty}
      </article>
    </div>
  );
}

