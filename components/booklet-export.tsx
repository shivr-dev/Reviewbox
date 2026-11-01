'use client';
import { trackProductEvent } from '@/lib/product-insights';
import { tr } from '@/lib/i18n';
import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { useReview } from './review-context';
import { currentNamespace } from '@/lib/store';
import type {
  BookletKind,
  BookletOptions,
  ExportImage,
} from '@/lib/export-docx';
import { QUESTION_TYPES } from '@/lib/question-tools';
import { usePreparedDownload, PreparedDownload } from './prepared-download';
export default function BookletExport({ close }: { close: () => void }) {
  const { data, subject } = useReview(),
    [title, setTitle] = useState('学习题目册'),
    [kind, setKind] = useState<BookletKind>('workbook'),
    [scope, setScope] = useState('all'),
    [lines, setLines] = useState(3),
    [group, setGroup] = useState<BookletOptions['groupBy']>('none'),
    [status, setStatus] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null),
    ns = currentNamespace();
  const download = usePreparedDownload(ns);
  useEffect(() => () => abort.current?.abort(), [ns]);
  const [questionType, setQuestionType] = useState('all'),
    [difficulty, setDifficulty] = useState('all'),
    [chapter, setChapter] = useState('all'),
    [limit, setLimit] = useState(100),
    [examMinutes, setExamMinutes] = useState(60);
  const chapterNames = Object.fromEntries(
    data.nodes.map((n) => [n.id, n.chapter || n.unit || n.title]),
  );
  const wrong = new Set(
    data.events
      .filter((e) => !e.voidedBy && e.outcome === 'wrong')
      .map((e) => e.questionId),
  );
  const members = scope.startsWith('pack:')
    ? data.packs.find((p) => p.id === scope.slice(5))?.questionIds
    : undefined;
  const questions = data.questions
    .filter(
      (q) =>
        q.reviewStatus !== 'paused' &&
        (subject === 'all' || q.subject === subject) &&
        (scope === 'wrong'
          ? wrong.has(q.id)
          : members
            ? members.includes(q.id)
            : true) &&
        (questionType === 'all' || q.type === questionType) &&
        (difficulty === 'all' || q.difficulty === Number(difficulty)) &&
        (chapter === 'all' || chapterNames[q.nodeId] === chapter),
    )
    .slice(0, limit);
  async function run() {
    trackProductEvent('export_started', 'subjects');
    setBusy(true);
    setError('');
    const controller = new AbortController();
    abort.current = controller;
    try {
      const [{ captureQuestionVisuals }, { exportBooklet }] = await Promise.all(
        [import('@/lib/export-visuals'), import('@/lib/export-docx')],
      );
      const images: Record<string, ExportImage[]> = {};
      for (const [i, q] of questions.entries()) {
        if (currentNamespace() !== ns || controller.signal.aborted)
          throw new Error('账户已切换或导出已取消');
        setStatus(`准备题图 ${i + 1} / ${questions.length}`);
        images[q.id] =
          kind === 'answers'
            ? []
            : await captureQuestionVisuals(q, 'question', controller.signal);
        if (['solutions', 'teacher'].includes(kind))
          images[q.id].push(
            ...(await captureQuestionVisuals(q, 'solution', controller.signal)),
          );
      }
      setStatus('正在生成 Word…');
      const blob = await exportBooklet(questions, {
        title,
        kind,
        answerLines: lines,
        groupBy: group,
        images,
        examMinutes,
        chapters: chapterNames,
      });
      if (controller.signal.aborted || currentNamespace() !== ns)
        throw new Error('导出已取消');
      download.prepare(
        blob,
        (title.replace(/[\\/:*?"<>|]/g, '').slice(0, 100) || 'Reviewbox') +
          '.docx',
      );
      setStatus(`已生成 ${questions.length} 题，请点击下载 Word 文档`);
      trackProductEvent('export_ready', 'subjects');
    } catch (e) {
      trackProductEvent('export_error', 'subjects');
      setError((e as Error).message);
      setStatus('');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          abort.current?.abort();
          close();
        }
      }}
    >
      <DialogContent className="booklet-dialog">
        <DialogTitle>{tr('common:导出 Word 题目册')}</DialogTitle>
        <DialogDescription>
          {tr(
            'common:只整理已有题目，保留公式、题图和原评分标准。不调用 AI 出题。',
          )}
        </DialogDescription>
        <label>
          {tr('common:题目册名称')}
          <input
            value={title}
            maxLength={100}
            onChange={(e) => setTitle(e.target.value)}
            disabled={busy}
          />
        </label>
        <label>
          {tr('common:内容范围')}
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            disabled={busy}
          >
            <option value="all">{tr('common:当前学科全部题目')}</option>
            <option value="wrong">{tr('common:错题')}</option>
            {data.packs
              .filter((p) => p.id !== 'review-framework')
              .map((p) => (
                <option key={p.id} value={'pack:' + p.id}>
                  {p.title} · v{p.version}
                </option>
              ))}
          </select>
        </label>
        <div className="booklet-filters">
          <label>
            题型
            <select
              value={questionType}
              onChange={(e) => setQuestionType(e.target.value)}
              disabled={busy}
            >
              <option value="all">全部题型</option>
              {QUESTION_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            难度
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              disabled={busy}
            >
              <option value="all">全部难度</option>
              {[1, 2, 3, 4, 5].map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label>
            章节
            <select
              value={chapter}
              onChange={(e) => setChapter(e.target.value)}
              disabled={busy}
            >
              <option value="all">全部章节</option>
              {[...new Set(Object.values(chapterNames))].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label>
            最多题数
            <input
              type="number"
              min={1}
              max={200}
              value={limit}
              onChange={(e) =>
                setLimit(
                  Math.max(1, Math.min(200, Number(e.target.value) || 1)),
                )
              }
              disabled={busy}
            />
          </label>
        </div>
        <label>
          {tr('common:文档类型')}
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as BookletKind)}
            disabled={busy}
          >
            {[
              ['workbook', tr('common:学生练习册')],
              ['exam', tr('common:试卷')],
              ['answers', tr('common:答案册')],
              ['solutions', tr('common:详细解析册')],
              ['teacher', tr('common:教师评分参考（Rubric / SOLO）')],
            ].map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          {tr('common:分组')}
          <select
            value={group}
            onChange={(e) => setGroup(e.target.value as any)}
            disabled={busy}
          >
            <option value="none">{tr('common:保留题库顺序')}</option>
            <option value="subject">{tr('common:按学科')}</option>
            <option value="type">{tr('common:按题型')}</option>
            <option value="chapter">按章节</option>
          </select>
        </label>
        {kind === 'exam' && (
          <label>
            考试时间（分钟）
            <input
              type="number"
              min={1}
              max={480}
              value={examMinutes}
              onChange={(e) =>
                setExamMinutes(
                  Math.max(1, Math.min(480, Number(e.target.value) || 1)),
                )
              }
              disabled={busy}
            />
          </label>
        )}
        {['workbook', 'exam'].includes(kind) && (
          <label>
            {tr('common:每题答题留白')}
            <select
              value={lines}
              onChange={(e) => setLines(Number(e.target.value))}
              disabled={busy}
            >
              {[0, 2, 3, 5, 8].map((n) => (
                <option key={n} value={n}>
                  {n}
                  {tr('common:行')}
                </option>
              ))}
            </select>
          </label>
        )}
        <p>
          {questions.length}
          {tr('common:题 · A4 · 黑白打印')}
        </p>
        {error && (
          <p role="alert" className="settings-error">
            {error}
          </p>
        )}
        {status && <p role="status">{status}</p>}
        <PreparedDownload file={download.file} />
        <div className="button-row">
          <button
            className="secondary"
            onClick={() => {
              abort.current?.abort();
              close();
            }}
          >
            {tr('common:取消')}
          </button>
          <button
            className="primary"
            disabled={busy || !questions.length || questions.length > 200}
            onClick={() => void run()}
          >
            {busy ? tr('common:正在导出…') : tr('common:生成 Word')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
