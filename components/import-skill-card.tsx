'use client';
import {tr} from '@/lib/i18n';
import { Copy, Check } from 'lucide-react';
import { useState } from 'react';
import ScientificAuthoring from './scientific-authoring';
import { IMPORT_SKILL } from '@/lib/import-skill';
import { useReview } from './review-context';
export default function ImportSkillCard({expanded = false, onImport}: {expanded?: boolean; onImport?: () => void} = {}) {
  const [copied, setCopied] = useState(false);
  const { notify } = useReview();
  const instructions = <textarea readOnly value={IMPORT_SKILL} rows={12} onFocus={event => event.target.select()}
    aria-label={tr('library:外部 AI 出题导入 Skill')} />;
  const copy = <button
        className={expanded ? 'primary' : 'secondary'}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(IMPORT_SKILL);
            setCopied(true);
            notify(tr("library:出题导入 Skill 已复制"));
            setTimeout(() => setCopied(false), 2500);
          } catch {
            notify(tr(expanded ? 'library:skillManualCopy' : 'library:剪贴板不可用，可展开说明后选择全文复制'));
          }
        }}
      >
        {copied ? <Check size={16} /> : <Copy size={16} />}{' '}
        {copied ? tr('library:已复制') : tr(expanded ? 'library:copySkillInstructions' : 'library:复制出题 Skill')}
      </button>;
  if (expanded) return <section className="rb-skill-page">
    <div className="rb-skill-actions">
      <p>{tr('library:skillWorkflow')}</p>
      <div className="button-row">{copy}
        {onImport && <button className="secondary" type="button" onClick={onImport}>{tr('library:importSkillOutput')}</button>}
      </div>
    </div>
    <div className="rb-skill-instructions">{instructions}</div>
    <div className="rb-skill-science"><ScientificAuthoring /></div>
  </section>;
  return (
    <section className="panel import-skill-card">
      <div>
        <p className="eyebrow">BRING YOUR OWN QUESTIONS</p>
        <h2>{tr('library:让外部 AI 按你的方式出题')}<small className="settings-caption">{tr('library:Skill 4.1 · 科学制图与数学输入')}</small></h2>
        <p className="muted">{tr('library:复制 Skill 给 AI，再把它输出的完整学习包粘贴到「资料库 → 智能导入」。')}</p>
      </div>
      {copy}
      <ScientificAuthoring/>
      <details>
        <summary>{tr("library:查看完整说明")}</summary>
        {instructions}
      </details>
    </section>
  );
}
