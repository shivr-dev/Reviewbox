'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Settings2, GraduationCap } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { useReview } from './review-context';
import { subjectName } from '@/lib/model';
import { currentNamespace } from '@/lib/store';
import {
  completedExams,
  examGpa,
  pendingExamScores,
  DEFAULT_GPA,
} from '@/lib/exam-outcomes';
import {
  saveExamScore,
  deferExamScore,
  saveGpaConfig,
} from '@/lib/exam-outcome-client';
export default function ExamResults({
  compact = false,
  autoOpen = false,
  initialExamId,
  onClosed,
}: {
  compact?: boolean;
  autoOpen?: boolean;
  initialExamId?: string;
  onClosed?: () => void;
}) {
  const { data, refresh, notify } = useReview();
  const report = examGpa(data),
    eligible = completedExams(data),
    pending = pendingExamScores(data);
  const [open, setOpen] = useState(false),
    [tab, setTab] = useState('scores'),
    [examId, setExamId] = useState(''),
    [busy, setBusy] = useState(false);
  const lock = useRef(false),
    openNamespace = useRef(currentNamespace());
  const selected = eligible.find((e) => e.id === examId);
  function show() {
    openNamespace.current = currentNamespace();
    setExamId(
      eligible.some((e) => e.id === initialExamId)
        ? initialExamId!
        : (pending[0]?.id ?? eligible[0]?.id ?? ''),
    );
    setTab('scores');
    setOpen(true);
  }
  const opened = useRef(false);
  useEffect(() => {
    if (autoOpen && !opened.current) {
      opened.current = true;
      show();
    }
  }, [autoOpen]);
  async function task(fn: () => Promise<void>, message: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await fn();
      await refresh();
      notify(message);
    } catch (e) {
      notify(e instanceof Error ? e.message : '未能保存，请重试');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (compact && !eligible.length) return null;
  return (
    <div
      className={compact ? 'exam-result-entry compact' : 'exam-result-entry'}
    >
      <button className={compact ? 'quiet' : 'secondary'} onClick={show}>
        <GraduationCap size={17} />
        {pending.length
          ? pending.length + ' 场考试待录入成绩'
          : report.value === null
            ? '录入考试成绩'
            : '考试 GPA ' +
              report.value.toFixed(2) +
              ' / ' +
              report.config.scale}
        <ArrowRight size={15} />
      </button>
      {!compact && report.value !== null && (
        <small>{report.rows.length} 场已录入 · 可修改换算公式</small>
      )}
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!busy) {
            setOpen(v);
            if (!v) onClosed?.();
          }
        }}
      >
        <DialogContent className="exam-results-dialog">
          <DialogTitle>考试成绩与 GPA</DialogTitle>
          <DialogDescription>
            录入真实考试结果，学习计划会据此调整。
          </DialogDescription>
          <div className="real-gpa-summary">
            <GraduationCap />
            <div>
              <strong>
                {report.value === null
                  ? '待录入成绩'
                  : report.value.toFixed(2) +
                    ' / ' +
                    report.config.scale.toFixed(2)}
              </strong>
              <span>
                {report.rows.length} 场考试 ·{' '}
                {report.config.weighted ? '按学分加权' : '各考试等权'}
              </span>
            </div>
          </div>
          <div className="exam-results-tabs">
            <button
              className="quiet"
              aria-pressed={tab === 'scores'}
              onClick={() => setTab('scores')}
              disabled={busy}
            >
              考试成绩
            </button>
            <button
              className="quiet"
              aria-pressed={tab === 'formula'}
              onClick={() => setTab('formula')}
              disabled={busy}
            >
              <Settings2 size={14} />
              GPA 公式
            </button>
          </div>
          {tab === 'scores' ? (
            <>
              {!eligible.length && (
                <p className="muted">
                  考试计划到达考试日期后，可在这里录入成绩。
                </p>
              )}
              {!!eligible.length && (
                <label className="exam-result-picker">
                  选择考试
                  <select
                    value={examId}
                    disabled={busy}
                    onChange={(e) => setExamId(e.target.value)}
                  >
                    {eligible.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.title} · {e.date}
                        {e.result
                          ? ' · ' + e.result.score + '/' + e.result.maxScore
                          : ' · 未录入'}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {selected && (
                <form
                  key={selected.id + selected.result?.recordedAt}
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const fields = new FormData(e.currentTarget),
                      id = selected.id;
                    await task(
                      () =>
                        saveExamScore(
                          id,
                          {
                            score: Number(fields.get('score')),
                            maxScore: Number(fields.get('maxScore')),
                            credits: Number(fields.get('credits')),
                            recordedAt: new Date().toISOString(),
                          },
                          openNamespace.current,
                        ),
                      '成绩已保存，GPA 与学习计划已更新',
                    );
                  }}
                >
                  <p className="muted">
                    {subjectName(selected.subject)} · 目标 {selected.target}%
                  </p>
                  <div className="exam-score-fields">
                    <label>
                      实际得分
                      <input
                        name="score"
                        aria-label="实际得分"
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        defaultValue={selected.result?.score}
                      />
                    </label>
                    <label>
                      试卷满分
                      <input
                        name="maxScore"
                        aria-label="试卷满分"
                        type="number"
                        min="0.01"
                        max="100000"
                        step="0.01"
                        required
                        defaultValue={selected.result?.maxScore ?? 100}
                      />
                    </label>
                  </div>
                  <label>
                    学分 / GPA 权重
                    <input
                      name="credits"
                      aria-label="学分或权重"
                      type="number"
                      min="0.01"
                      max="100"
                      step="0.01"
                      required
                      defaultValue={selected.result?.credits ?? 1}
                    />
                  </label>
                  <small>
                    不知道学分时填 1。零分也可以录入；未出分不会按零分计算。
                  </small>
                  <div className="button-row">
                    <button className="primary" type="submit" disabled={busy}>
                      {busy ? '正在保存' : '保存成绩'}
                    </button>
                    {!selected.result && (
                      <button
                        className="quiet"
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void task(
                            () =>
                              deferExamScore(
                                selected.id,
                                openNamespace.current,
                              ),
                            '已延后提醒，明天再填写',
                          )
                        }
                      >
                        尚未出分，明天提醒
                      </button>
                    )}
                  </div>
                </form>
              )}
            </>
          ) : (
            <form
              key={JSON.stringify(report.config)}
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                await task(
                  () =>
                    saveGpaConfig(
                      {
                        scale: Number(f.get('scale')),
                        formula: String(f.get('formula')),
                        weighted: f.get('weighted') === 'on',
                        from: String(f.get('from') || ''),
                        to: String(f.get('to') || ''),
                      },
                      openNamespace.current,
                    ),
                  'GPA 公式已保存，全部成绩已重新计算',
                );
              }}
            >
              <label>
                GPA 满分
                <input
                  name="scale"
                  aria-label="GPA 满分"
                  type="number"
                  min="1"
                  max="10"
                  step="0.01"
                  required
                  defaultValue={report.config.scale}
                />
              </label>
              <label>
                单场成绩换算公式
                <input
                  name="formula"
                  aria-label="GPA 换算公式"
                  maxLength={240}
                  required
                  defaultValue={report.config.formula}
                />
              </label>
              <small>
                默认：ratio × scale。最终 GPA
                为各场换算分的加权平均；单场换算结果限制在 0 至满分。
              </small>
              <label className="gpa-weighted">
                <input
                  name="weighted"
                  type="checkbox"
                  defaultChecked={report.config.weighted}
                />
                按学分 / 权重计算
              </label>
              <details>
                <summary>公式变量与示例</summary>
                <p>
                  ratio = 得分 ÷ 试卷满分；percent = 百分制成绩；score =
                  得分；maxScore = 试卷满分；scale = GPA 满分。
                </p>
                <code>ratio * scale</code>
                <p>示例阶梯换算（请按学校规则修改）：</p>
                <code>min(scale, max(0, floor((percent - 50) / 10)))</code>
                <p>
                  支持 + − * / ^、括号与
                  min、max、floor、ceil、round。不会执行代码。
                </p>
              </details>
              <details>
                <summary>统计日期范围（可选）</summary>
                <div className="exam-score-fields">
                  <label>
                    开始日期
                    <input
                      name="from"
                      type="date"
                      defaultValue={report.config.from}
                    />
                  </label>
                  <label>
                    结束日期
                    <input
                      name="to"
                      type="date"
                      defaultValue={report.config.to}
                    />
                  </label>
                </div>
              </details>
              <div className="button-row">
                <button className="primary" disabled={busy} type="submit">
                  保存公式
                </button>
                <button
                  className="quiet"
                  disabled={busy}
                  type="button"
                  onClick={() =>
                    void task(
                      () => saveGpaConfig(DEFAULT_GPA, openNamespace.current),
                      '已恢复默认换算公式',
                    )
                  }
                >
                  恢复默认
                </button>
              </div>
            </form>
          )}
          {!!report.excluded.length && (
            <p className="inline-hint">
              有 {report.excluded.length} 场成绩无法按当前公式换算，请调整公式。
            </p>
          )}
          <small>
            考试 GPA 按当前公式换算，与每周学习 GPA、题目掌握度分别统计。
          </small>
        </DialogContent>
      </Dialog>
    </div>
  );
}
