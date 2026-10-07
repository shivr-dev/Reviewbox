'use client';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { useReview } from './review-context';
import type { Question } from '@/lib/model';
import { questionHistory } from '@/lib/question-quality';
import { reviewQuestion, verifyRevision } from '@/lib/quality-client';
import { currentNamespace } from '@/lib/store';
import MathText from './math-text';

export default function QuestionReviewButton({
  question,
}: {
  question: Question;
}) {
  const { data, refresh, aiReady } = useReview();
  const q = data.questions.find((x) => x.id === question.id) ?? question;
  const [open, setOpen] = useState(false),
    [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [reason, setReason] = useState(''),
    [draft, setDraft] = useState(q),
    [exclude, setExclude] = useState(true),
    [ns, setNs] = useState('');
  const history = questionHistory(data, q.id);
  const act = async (action: 'pause' | 'resume' | 'revise') => {
    setBusy(true);
    setError('');
    try {
      await reviewQuestion(
        q,
        action,
        reason ||
          (action === 'pause'
            ? '答案或题意待核对'
            : action === 'resume'
              ? '已核对，原题无需修订'
              : ''),
        draft,
        exclude,
        ns,
      );
      await refresh();
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作未完成，请重试');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button
        className="quiet question-review-trigger"
        onClick={() => {
          setOpen(true);
          setNs(currentNamespace());
          setDraft(q);
          setReason('');
          setError('');
          setEditing(false);
        }}
      >
        {q.reviewStatus === 'paused' ? '题目已暂停 · 查看纠错' : '题目有误？'}
      </button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!busy) setOpen(v);
        }}
      >
        <DialogContent className="quality-dialog">
          <DialogTitle>答案争议与修订</DialogTitle>
          <DialogDescription>
            暂停后不再安排这道题，相关作答暂不参与掌握度与认知分析。原始记录会保留；恢复原题可重新计入。
          </DialogDescription>
          <p>
            <MathText>{q.prompt}</MathText>
          </p>
          <label>
            争议或修订原因
            <textarea
              value={reason}
              maxLength={1200}
              onChange={(e) => setReason(e.target.value)}
              placeholder="例如：条件不完整，或标准答案存在计算错误"
            />
          </label>
          {editing && (
            <div className="quality-fields">
              <label>
                题干
                <textarea
                  value={draft.prompt}
                  onChange={(e) =>
                    setDraft({ ...draft, prompt: e.target.value })
                  }
                />
              </label>
              {draft.passage !== undefined && (
                <label>
                  阅读材料
                  <textarea
                    value={draft.passage}
                    onChange={(e) =>
                      setDraft({ ...draft, passage: e.target.value })
                    }
                  />
                </label>
              )}
              {draft.options && (
                <label>
                  选项（每行一项）
                  <textarea
                    value={draft.options.join('\n')}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        options: e.target.value.split('\n'),
                      })
                    }
                  />
                </label>
              )}
              <label>
                参考答案
                <textarea
                  value={draft.answer}
                  onChange={(e) =>
                    setDraft({ ...draft, answer: e.target.value })
                  }
                />
              </label>
              <label>
                解析
                <textarea
                  value={draft.explanation}
                  onChange={(e) =>
                    setDraft({ ...draft, explanation: e.target.value })
                  }
                />
              </label>
              {draft.solution && (
                <label>
                  解题步骤（每行一步）
                  <textarea
                    value={draft.solution.join('\n')}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        solution: e.target.value.split('\n').filter(Boolean),
                      })
                    }
                  />
                </label>
              )}
              <label className="quality-check">
                <input
                  type="checkbox"
                  checked={exclude}
                  onChange={(e) => setExclude(e.target.checked)}
                />
                撤销旧题作答对掌握度的影响
              </label>
              <p className="muted">
                保存为新版本，旧题继续暂停。修订题标记为人工修订，需重新核验后才用于自动交叉验证。
              </p>
            </div>
          )}
          {error && (
            <p role="alert" className="inline-hint">
              {error}
            </p>
          )}
          <div className="button-row">
            {!editing && q.reviewStatus !== 'paused' && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() => void act('pause')}
              >
                暂停这道题
              </button>
            )}
            {!editing &&
              q.reviewStatus === 'paused' &&
              !history.some(
                (h) => h.action === 'revise' && h.questionId === q.id,
              ) && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => void act('resume')}
                >
                  核对无误，恢复原题
                </button>
              )}
            {!editing ? (
              <button
                className="secondary"
                disabled={
                  busy ||
                  history.some(
                    (h) => h.action === 'revise' && h.questionId === q.id,
                  )
                }
                onClick={() => setEditing(true)}
              >
                修订题目
              </button>
            ) : (
              <button
                className="primary"
                disabled={busy || !reason.trim()}
                onClick={() => void act('revise')}
              >
                {busy ? '正在保存' : '保存新版本并重算'}
              </button>
            )}
          </div>
          {history.length > 0 && (
            <details>
              <summary>版本与纠错记录（{history.length}）</summary>
              {history.map((h) => (
                <article key={h.id} className="quality-history">
                  <b>
                    {h.action === 'pause'
                      ? '暂停'
                      : h.action === 'resume'
                        ? '恢复'
                        : '修订'}{' '}
                    · {new Date(h.at).toLocaleString()}
                  </b>
                  <p>{h.reason}</p>
                  <p className="muted">
                    原版本 {h.original.version} · 撤销{' '}
                    {h.excludedEventIds.length} 条旧题证据
                  </p>
                  <details>
                    <summary>原题答案与解析</summary>
                    <MathText>{h.original.answer}</MathText>
                    <p>
                      <MathText>{h.original.explanation}</MathText>
                    </p>
                  </details>
                  {h.replacement && (
                    <details>
                      <summary>修订版答案</summary>
                      <MathText>{h.replacement.answer}</MathText>
                      {(() => {
                        const revised = data.questions.find(
                          (x) => x.id === h.replacement!.id,
                        );
                        return revised &&
                          !revised.verified &&
                          revised.reviewStatus !== 'paused' ? (
                          <>
                            <p className="muted">
                              仅核验当前修订题，未通过时保留内容供继续修改。此操作调用
                              AI。
                            </p>
                            <button
                              className="secondary"
                              disabled={busy || !aiReady}
                              onClick={async () => {
                                setBusy(true);
                                setError('');
                                try {
                                  await verifyRevision(revised, ns);
                                  await refresh();
                                } catch (e) {
                                  setError(
                                    e instanceof Error
                                      ? e.message
                                      : '核验未完成',
                                  );
                                } finally {
                                  setBusy(false);
                                }
                              }}
                            >
                              核验修订题
                            </button>
                          </>
                        ) : revised?.verified ? (
                          <p className="muted">修订题已核验</p>
                        ) : null;
                      })()}
                    </details>
                  )}
                </article>
              ))}
            </details>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
