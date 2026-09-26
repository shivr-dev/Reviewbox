'use client';
import { useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import {
  CHINESE_IMPORT_TYPES,
  GENERAL_IMPORT_TYPES,
  manualExample,
  parseManualImport,
} from '@/lib/manual-import';
import { SUBJECTS, type Subject } from '@/lib/model';
import { currentNamespace, saveRecords } from '@/lib/store';
import { useReview } from './review-context';
import MathText from './math-text';
export default function ManualImport({
  subject: initial = 'chinese',
}: {
  subject?: Subject;
}) {
  const { refresh, notify } = useReview();
  const [open, setOpen] = useState(false),
    [subject, setSubject] = useState<Subject>(initial),
    [preset, setPreset] = useState(initial === 'chinese' ? 'pinyin' : 'recall'),
    [title, setTitle] = useState(''),
    [text, setText] = useState(''),
    [preview, setPreview] = useState<ReturnType<
      typeof parseManualImport
    > | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const lock = useRef(false),
    origin = useRef(currentNamespace());
  const types =
    subject === 'chinese' ? CHINESE_IMPORT_TYPES : GENERAL_IMPORT_TYPES;
  return (
    <>
      <button
        className="secondary"
        onClick={() => {
          origin.current = currentNamespace();
          setOpen(true);
        }}
      >
        手动导入题目
      </button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!busy) setOpen(v);
        }}
      >
        <DialogContent className="import-dialog manual-question-dialog">
          <DialogTitle>手动导入题目</DialogTitle>
          <DialogDescription>
            选择学科与题型，填写或粘贴普通文字，预览后保存。全程不调用
            AI，也不要求编写 JSON。
          </DialogDescription>
          {!preview ? (
            <>
              <div className="exam-form-grid">
                <label>
                  学科
                  <select
                    value={subject}
                    onChange={(e) => {
                      const s = e.target.value as Subject;
                      setSubject(s);
                      setPreset(s === 'chinese' ? 'pinyin' : 'recall');
                      setError('');
                    }}
                  >
                    {SUBJECTS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  题型
                  <select
                    value={preset}
                    onChange={(e) => {
                      setPreset(e.target.value);
                      setError('');
                    }}
                  >
                    {types.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                {preset === 'pinyin' ? '字词篇目名称' : '知识点或篇目名称'}
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={preset === 'pinyin' ? '例如：藤野先生字词' : '例如：二次函数顶点、静夜思'}
                  maxLength={200}
                />
              </label>
              <p className="muted">
                {preset === 'pinyin'
                  ? '每行一道，格式为：拼音｜汉字。篇目是字词集合，每个字词单独记录掌握度；练整篇时会覆盖全部字词。揭晓后手动判断，无需输入汉字。'
                  : '使用下方示例的字段格式。多道题之间单独一行填写 ---；原文和答案均可换行。'}
              </p>
              <details className="manual-format-help" open>
                <summary>查看当前题型格式</summary>
                <pre>{manualExample(preset, subject)}</pre>
                <button
                  className="quiet"
                  onClick={() => {
                    setText((t) =>
                      t.trim()
                        ? t +
                          (preset === 'pinyin' ? '\n' : '\n---\n') +
                          manualExample(preset, subject)
                        : manualExample(preset, subject),
                    );
                  }}
                >
                  将示例加入编辑框
                </button>
              </details>
              <label>
                题目内容
                <textarea
                  rows={9}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={300000}
                  placeholder={manualExample(preset, subject)}
                />
              </label>
              <label className="muted">
                也可读取按以上格式填写的文本文件
                <input
                  type="file"
                  accept=".txt,.md,.tsv"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    if (file.size > 1500000) {
                      setError('文本文件最多 1.5 MB。');
                      return;
                    }
                    setText(await file.text());
                  }}
                />
              </label>
              <button
                className="primary"
                disabled={!text.trim()}
                onClick={() => {
                  try {
                    setError('');
                    setPreview(parseManualImport(text, subject, preset, title));
                  } catch (e) {
                    setError(e instanceof Error ? e.message : '内容格式不正确');
                  }
                }}
              >
                预览导入内容
              </button>
            </>
          ) : (
            <>
              <h3>
                {preview.title} · {preview.questions.length} 道题
              </h3>
              <div className="import-preview">
                {preview.questions.map((q, i) => (
                  <article key={q.id}>
                    <b>
                      {i + 1}. <MathText>{q.prompt}</MathText>
                    </b>
                    {q.passage && (
                      <p>
                        <MathText>{q.passage}</MathText>
                      </p>
                    )}
                    {q.options?.map((o, j) => (
                      <p key={j}>
                        {String.fromCharCode(65 + j)}. <MathText>{o}</MathText>
                      </p>
                    ))}
                    <p>
                      答案：
                      <MathText>
                        {q.matching
                          ? q.matching.left
                              .map(
                                (l) =>
                                  l.text +
                                  ' → ' +
                                  q.matching!.right.find(
                                    (r) => r.id === JSON.parse(q.answer)[l.id],
                                  )!.text,
                              )
                              .join('；')
                          : q.answer}
                      </MathText>
                    </p>
                    {q.explanation && <p className="muted"><MathText>{q.explanation}</MathText></p>}
                  </article>
                ))}
              </div>
              <div className="button-row">
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => setPreview(null)}
                >
                  返回修改
                </button>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={async () => {
                    if (lock.current) return;
                    lock.current = true;
                    setBusy(true);
                    try {
                      if (currentNamespace() !== origin.current)
                        throw Error('账户已切换，请关闭窗口后重新导入。');
                      const now = new Date().toISOString();
                      await saveRecords(
                        [
                          ...preview.nodes.map((node) => ({
                            id: node.id,
                            kind: 'node' as const,
                            payload: node,
                            updated_at: now,
                            deleted: false,
                          })),
                          ...preview.questions.map((q) => ({
                            id: q.id,
                            kind: 'question' as const,
                            payload: q,
                            updated_at: now,
                            deleted: false,
                          })),
                        ],
                        true,
                        origin.current,
                      );
                      setPreview(null);
                      setText('');
                      setOpen(false);
                      await refresh();
                      notify('手动导入完成，可在本学科练习和题目库中查看。');
                    } catch (e) {
                      setError(
                        e instanceof Error ? e.message : '保存失败，内容已保留',
                      );
                    } finally {
                      lock.current = false;
                      setBusy(false);
                    }
                  }}
                >
                  {busy ? '正在保存…' : '确认导入'}
                </button>
              </div>
            </>
          )}
          {error && (
            <p role="alert" className="import-error">
              {error}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
