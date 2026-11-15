'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowLeft, ArrowUpRight, ClipboardPaste, FileText, Upload } from 'lucide-react';
import { tr } from '@/lib/i18n';
import { subjectLabel } from '@/lib/presentation';
import type { Material } from '@/lib/model';
import { dateLabel } from './shared';

export type ImportSource = 'file' | 'text';

export function ImportChoices({onChoose}: {onChoose: (source: ImportSource) => void}) {
  return <div className="rb-intake-choices">
    <button type="button" onClick={() => onChoose('file')}>
      <Upload size={23} aria-hidden="true" />
      <span><strong>{tr('library:选择文件')}</strong><small>PDF, Word, PNG, JSON</small></span>
      <ArrowUpRight size={17} aria-hidden="true" />
    </button>
    <button type="button" onClick={() => onChoose('text')}>
      <ClipboardPaste size={23} aria-hidden="true" />
      <span><strong>{tr('library:pasteText')}</strong><small>{tr('library:textSourceHint')}</small></span>
      <ArrowUpRight size={17} aria-hidden="true" />
    </button>
  </div>;
}

export default function MaterialDesk({
  entries, active, featureLatest, filtered, controls, pagination, onOpen, onBack, onRow, onImport, onChooseSource, children,
}: {
  entries: Material[];
  active?: Material;
  featureLatest: boolean;
  filtered: boolean;
  controls: ReactNode;
  pagination?: ReactNode;
  onOpen: (id: string) => void;
  onBack: () => void;
  onRow: (id: string, el: HTMLButtonElement | null) => void;
  onImport: () => void;
  onChooseSource: (source: ImportSource) => void;
  children: ReactNode;
}) {
  const document = useRef<HTMLElement>(null);
  const openedFrom = useRef('');
  const rows = useRef(new Map<string, HTMLButtonElement>());
  const register = (id: string, element: HTMLButtonElement | null) => {
    if (element) rows.current.set(id, element);
    else rows.current.delete(id);
    onRow(id, element);
  };

  useEffect(() => {
    if (active) document.current?.focus();
    else rows.current.get(openedFrom.current)?.focus();
  }, [active?.id]);

  if (active) return <article className="rb-material-document" ref={document} tabIndex={-1}>
    <button type="button" className="quiet rb-material-return" onClick={onBack}>
      <ArrowLeft size={17} aria-hidden="true" />{tr('library:学习资料')}
    </button>
    <div className="rb-material-reading-page">{children}</div>
  </article>;

  const latest = featureLatest ? entries[0] : undefined;
  const index = latest ? entries.slice(1) : entries;
  return <div className="rb-material-desk">
    <header className="rb-material-desk-head" data-has-files={entries.length > 0 || undefined}>
      <h2 className={entries.length > 0 ? 'sr-only' : undefined}>{tr('library:学习资料')}</h2>
      {entries.length > 0 && <button type="button" className="primary" onClick={onImport}>
        <Upload size={16} aria-hidden="true" />{tr('library:导入')}
      </button>}
      <div className="rb-material-search">{controls}</div>
    </header>
    {latest && <button type="button" className="rb-material-latest" ref={el => register(latest.id,el)}
      onClick={() => {openedFrom.current = latest.id;onOpen(latest.id);}}>
      <span className="rb-material-latest-title">
        <small>{tr('library:最近添加')} · {subjectLabel(latest.subject)}</small>
        <strong>{latest.name}</strong>
        <span>{tr('library:readMaterial')} <ArrowUpRight size={17} aria-hidden="true" /></span>
      </span>
      {latest.text.trim() && <span className="rb-material-excerpt" aria-hidden="true">{latest.text.trim().slice(0, 650)}</span>}
    </button>}
    {index.length > 0 && <ul className="rb-material-files">
      {index.map(entry => <li key={entry.id}>
        <button type="button" ref={el => register(entry.id,el)}
          onClick={() => {openedFrom.current = entry.id;onOpen(entry.id);}}>
          <FileText size={21} aria-hidden="true" />
          <span><strong>{entry.name}</strong><small>{subjectLabel(entry.subject)} · {dateLabel(entry.date)}</small></span>
          <ArrowUpRight size={16} aria-hidden="true" />
        </button>
      </li>)}
    </ul>}
    {!entries.length && <section className="rb-material-empty">
      <h3>{tr(filtered ? 'library:noMatchingMaterial' : 'library:materialEmpty')}</h3>
      <ImportChoices onChoose={onChooseSource} />
    </section>}
    {pagination}
  </div>;
}

