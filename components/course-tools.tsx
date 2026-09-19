'use client';
import { useState } from 'react';
import { Bookmark, Check } from 'lucide-react';
import { type CourseContent, type CourseSection } from '@/lib/course-model';
import { courseErrorMessage } from '@/lib/course-errors';

export function CourseSources({
  content,
  source,
}: {
  content: CourseContent;
  source: string;
}) {
  const warnings = 'sourceWarnings' in content ? content.sourceWarnings : [];
  const pending = warnings.length > 0 || content.sourceQuotes.length === 0;
  return (
    <details className="course-source-review">
      <summary>{pending ? '教材依据 · 待核对' : '教材依据 · 查看引文'}</summary>
      <p className="muted">
        引文匹配仅说明文字可在资料中找到，不代表课件内容已经核验正确。
      </p>
      {content.sourceQuotes.length > 0 && (
        <>
          <h4>已对应的引文</h4>
          {content.sourceQuotes.map((q, i) => (
            <blockquote key={i}>{q}</blockquote>
          ))}
        </>
      )}
      {pending && (
        <div className="source-review-notice" role="note">
          <p>
            {warnings.length
              ? '以下引文未能在资料中对应，不能作为教材依据。请结合原文核对课件中的相关讲解。'
              : '课件未提供可对应的引文，请结合下方原始资料核对讲解。'}
          </p>
          {warnings.map((q, i) => (
            <blockquote key={i}>{q}</blockquote>
          ))}
        </div>
      )}
      <h4>本节原始资料</h4>
      <pre>{source}</pre>
    </details>
  );
}

export function CourseStudyTools({
  section,
  onSave,
}: {
  section: CourseSection;
  onSave: (
    changes: Pick<CourseSection, 'bookmarked' | 'studyMemo'>,
  ) => Promise<unknown>;
}) {
  const [memo, setMemo] = useState(section.studyMemo ?? '');
  const [saved, setSaved] = useState(section.studyMemo ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(
    changes: Pick<CourseSection, 'bookmarked' | 'studyMemo'>,
  ) {
    setBusy(true);
    setError('');
    try {
      await onSave(changes);
      if (changes.studyMemo !== undefined) setSaved(changes.studyMemo);
    } catch (e) {
      setError(courseErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="course-study-tools">
      <button
        className="quiet"
        disabled={busy}
        aria-pressed={!!section.bookmarked}
        onClick={() => void save({ bookmarked: !section.bookmarked })}
      >
        <Bookmark
          size={16}
          fill={section.bookmarked ? 'currentColor' : 'none'}
        />
        {section.bookmarked ? '已加入书签' : '加入书签'}
      </button>
      <details>
        <summary>学习备忘{saved ? ' · 已记录' : ''}</summary>
        <label>
          用自己的话记录理解、易错点或尚未解决的问题
          <textarea
            rows={5}
            value={memo}
            maxLength={5000}
            disabled={busy}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="例如：我能够解释……，但还需要弄清……"
          />
        </label>
        <div className="button-row">
          <button
            className="secondary"
            disabled={busy || memo === saved}
            onClick={() => void save({ studyMemo: memo })}
          >
            {busy ? '正在保存' : '保存备忘'}
          </button>
          <span className="muted" role="status">
            {memo !== saved ? (
              '有未保存的修改，请在离开本节前保存'
            ) : saved ? (
              <>
                <Check size={14} />
                已保存到个人课程
              </>
            ) : (
              '仅供个人回顾，不影响掌握度'
            )}
          </span>
        </div>
      </details>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
