'use client';
import {subjectLabel as subjectName} from '@/lib/presentation';
import {tr} from '@/lib/i18n';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Settings2, GraduationCap } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { useReview } from './review-context';

import { currentNamespace } from '@/lib/store';
import {
  completedExams,
  examGpa,
  pendingExamScores,
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
  reviewOnSave = false,
}: {
  compact?: boolean;
  autoOpen?: boolean;
  initialExamId?: string;
  onClosed?: () => void;
  reviewOnSave?: boolean;
}) {
  const { data, refresh, notify, navigate } = useReview();
  const reviewText = (key:string) => tr('dashboard:examReview.'+key);
  const report = examGpa(data),
    eligible = completedExams(data),
    pending = pendingExamScores(data);
  const [open, setOpen] = useState(false),
    [tab, setTab] = useState('scores'),
    [examId, setExamId] = useState(''),
    [gpaMethod, setGpaMethod] = useState<'formula'|'bands'>(report.config.bands?'bands':'formula'),
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
    setGpaMethod(report.config.bands?'bands':'formula');
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
      return true;
    } catch (e) {
      notify(e instanceof Error && e.message==='GPA_BANDS' ? reviewText('bandsError') :
        e instanceof Error ? tr('results:'+e.message) : reviewText('saveError'));
      return false;
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
            ? tr("common:录入考试成绩")
            : reviewText(report.configured?'academicGpa':'estimatedGpa')+' '+
              report.value.toFixed(2) +
              ' / ' +
              report.config.scale}
        <ArrowRight size={15} />
      </button>
      {!compact && report.value !== null && (
        <small>{report.rows.length}{tr("results:场已录入 · 可修改换算公式")}</small>
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
          <DialogTitle>{tr("results:考试成绩与 GPA")}</DialogTitle>
          <DialogDescription>{tr("results:录入真实考试结果，学习计划会据此调整。")}</DialogDescription>
          <div className="real-gpa-summary">
            <GraduationCap />
            <div>
              <strong>
                {report.value === null
                  ? tr("results:待录入成绩")
                  : report.value.toFixed(2) +
                    ' / ' +
                    report.config.scale.toFixed(2)}
              </strong>
              <span>{reviewText(report.configured?'academicGpa':'estimatedGpa')}</span>
              <span>
                {report.rows.length}{tr("results:场考试 ·")}{' '}
                {report.config.weighted ? tr("results:按学分加权") : tr("results:各考试等权")}
              </span>
            </div>
          </div>
          <div className="exam-results-tabs">
            <button
              className="quiet"
              aria-pressed={tab === 'scores'}
              onClick={() => setTab('scores')}
              disabled={busy}
            >{tr("results:考试成绩")}</button>
            <button
              className="quiet"
              aria-pressed={tab === 'formula'}
              onClick={() => setTab('formula')}
              disabled={busy}
            >
              <Settings2 size={14} />{tr("results:GPA 公式")}</button>
          </div>
          {tab === 'scores' ? (
            <>
              {!eligible.length && (
                <p className="muted">{tr("results:考试计划到达考试日期后，可在这里录入成绩。")}</p>
              )}
              {!!eligible.length && (
                <label className="exam-result-picker">{tr("results:选择考试")}<select
                    value={examId}
                    disabled={busy}
                    onChange={(e) => setExamId(e.target.value)}
                  >
                    {eligible.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.title} · {e.date}
                        {e.result
                          ? ' · ' + e.result.score + '/' + e.result.maxScore
                          : tr("results: · 未录入")}
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
                    const saved = await task(
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
                      tr("common:成绩已保存，GPA 与学习计划已更新"),
                    );
                    if (saved && reviewOnSave && openNamespace.current===currentNamespace()) {
                      setOpen(false);
                      navigate('results','all','report:'+id);
                    }
                  }}
                >
                  <p className="muted">
                    {subjectName(selected.subject)}{tr("results:· 目标")}{selected.target}%
                  </p>
                  <div className="exam-score-fields">
                    <label>{tr("results:实际得分")}<input
                        name="score"
                        aria-label={tr("results:实际得分")}
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        defaultValue={selected.result?.score}
                      />
                    </label>
                    <label>{tr("results:试卷满分")}<input
                        name="maxScore"
                        aria-label={tr("results:试卷满分")}
                        type="number"
                        min="0.01"
                        max="100000"
                        step="0.01"
                        required
                        defaultValue={selected.result?.maxScore ?? 100}
                      />
                    </label>
                  </div>
                  <label>{tr("results:学分 / GPA 权重")}<input
                      name="credits"
                      aria-label={tr("results:学分或权重")}
                      type="number"
                      min="0.01"
                      max="100"
                      step="0.01"
                      required
                      defaultValue={selected.result?.credits ?? 1}
                    />
                  </label>
                  <small>{tr("results:不知道学分时填 1。零分也可以录入；未出分不会按零分计算。")}</small>
                  <div className="button-row">
                    <button className="primary" type="submit" disabled={busy}>
                      {busy ? tr("results:正在保存") : tr("results:保存成绩")}
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
                            tr("common:已延后提醒，明天再填写"),
                          )
                        }
                      >{tr("results:尚未出分，明天提醒")}</button>
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
                  async () => {
                    const source=String(f.get('bands')??'').trim();
                    const bands=gpaMethod==='bands'?source.split(/\r?\n/).map(line=>{
                      const [minimum,points,label,...extra]=line.split(/[,，]/).map(v=>v.trim());
                      if(!minimum||!points||extra.length)throw new Error('GPA_BANDS');
                      return {minimum:Number(minimum),points:Number(points),label:label||undefined};
                    }):undefined;
                    await saveGpaConfig(
                      {
                        scale: Number(f.get('scale')),
                        formula: String(f.get('formula')??report.config.formula),
                        bands,
                        weighted: f.get('weighted') === 'on',
                        from: String(f.get('from') || ''),
                        to: String(f.get('to') || ''),
                      },
                      openNamespace.current,
                    );
                  },
                  tr("common:GPA 公式已保存，全部成绩已重新计算"),
                );
              }}
            >
              <label>{tr("results:GPA 满分")}<input
                  name="scale"
                  aria-label={tr("results:GPA 满分")}
                  type="number"
                  min="1"
                  max="10"
                  step="0.01"
                  required
                  defaultValue={report.config.scale}
                />
              </label>
              <label>{reviewText('method')}<select value={gpaMethod} onChange={e=>setGpaMethod(e.target.value as typeof gpaMethod)}>
                <option value="formula">{reviewText('methodFormula')}</option>
                <option value="bands">{reviewText('methodBands')}</option>
              </select></label>
              {gpaMethod==='bands' ? <label>{reviewText('methodBands')}<textarea name="bands" required rows={6} maxLength={900}
                defaultValue={report.config.bands?.map(b=>[b.minimum,b.points,b.label??''].join(', ')).join('\n')}/>
                <small>{reviewText('bandsHelp')}</small>
              </label>:<><label>{tr("results:单场成绩换算公式")}<input
                  name="formula"
                  aria-label={tr("results:GPA 换算公式")}
                  maxLength={240}
                  required
                  defaultValue={report.config.formula}
                />
              </label>
              <small>{tr("results:默认：ratio × scale。最终 GPA 为各场换算分的加权平均；单场换算结果限制在 0 至满分。")}</small></>}
              <label className="gpa-weighted">
                <input
                  name="weighted"
                  type="checkbox"
                  defaultChecked={report.config.weighted}
                />{tr("results:按学分 / 权重计算")}</label>
              <details>
                <summary>{tr("results:公式变量与示例")}</summary>
                <p>{tr("results:ratio = 得分 ÷ 试卷满分；percent = 百分制成绩；score = 得分；maxScore = 试卷满分；scale = GPA 满分。")}</p>
                <code>ratio * scale</code>
                <p>{tr("results:示例阶梯换算（请按学校规则修改）：")}</p>
                <code>min(scale, max(0, floor((percent - 50) / 10)))</code>
                <p>{tr("results:支持 + − * / ^、括号与 min、max、floor、ceil、round。不会执行代码。")}</p>
              </details>
              <details>
                <summary>{tr("results:统计日期范围（可选）")}</summary>
                <div className="exam-score-fields">
                  <label>{tr("results:开始日期")}<input
                      name="from"
                      type="date"
                      defaultValue={report.config.from}
                    />
                  </label>
                  <label>{tr("results:结束日期")}<input
                      name="to"
                      type="date"
                      defaultValue={report.config.to}
                    />
                  </label>
                </div>
              </details>
              <div className="button-row">
                <button className="primary" disabled={busy} type="submit">{tr("results:保存公式")}</button>
                <button
                  className="quiet"
                  disabled={busy}
                  type="button"
                  onClick={() =>
                    void task(
                      async () => {await saveGpaConfig(undefined, openNamespace.current);setGpaMethod('formula');},
                      tr("common:已恢复默认换算公式"),
                    )
                  }
                >{tr("results:恢复默认")}</button>
              </div>
            </form>
          )}
          {!!report.excluded.length && (
            <p className="inline-hint">{tr("results:有")}{report.excluded.length}{tr("results:场成绩无法按当前公式换算，请调整公式。")}</p>
          )}
          <small>{tr("results:考试 GPA 按当前公式换算，与每周学习 GPA、题目掌握度分别统计。")}</small>
        </DialogContent>
      </Dialog>
    </div>
  );
}
