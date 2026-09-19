'use client';
import { Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { IMPORT_SKILL } from '@/lib/import-skill';
import { useReview } from './review-context';
export default function ImportSkillCard() {
  const [copied, setCopied] = useState(false);
  const { notify } = useReview();
  return (
    <section className="panel import-skill-card">
      <div>
        <p className="eyebrow">BRING YOUR OWN QUESTIONS</p>
        <h2>让外部 AI 按你的方式出题</h2>
        <p className="muted">
          复制 Skill 给 AI，再把它输出的完整学习包粘贴到「资料库 → 智能导入」。
        </p>
      </div>
      <button
        className="secondary"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(IMPORT_SKILL);
            setCopied(true);
            notify('出题导入 Skill 已复制');
            setTimeout(() => setCopied(false), 2500);
          } catch {
            notify('剪贴板不可用，可展开说明后选择全文复制');
          }
        }}
      >
        {copied ? <Check size={16} /> : <Copy size={16} />}{' '}
        {copied ? '已复制' : '复制出题 Skill'}
      </button>
      <details>
        <summary>查看完整说明</summary>
        <textarea
          readOnly
          value={IMPORT_SKILL}
          rows={12}
          onFocus={(e) => e.target.select()}
          aria-label="外部 AI 出题导入 Skill"
        />
      </details>
    </section>
  );
}
