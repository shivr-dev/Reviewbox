'use client';
import {subjectLabel as subjectName} from '@/lib/presentation';
import {tr} from '@/lib/i18n';
import { useRef, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useReview } from './review-context';
import ExamResults from './exam-results';
import ExamScopePicker from './exam-scope-picker';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import {SUBJECTS,isExamScheduled,type Exam,type Subject} from '@/lib/model';
import { currentNamespace } from '@/lib/store';
import {
  saveExamDetails,
  setExamScheduled,
  deleteExamRecord,
  undoExamDeletion,
} from '@/lib/exam-schedule-client';
export default function ExamSchedule() {
  const { data, refresh, notify } = useReview();
  const [editor, setEditor] = useState<Exam | null | undefined>(undefined),
    [subject, setSubject] = useState<Subject>('math'),
    [scope, setScope] = useState<string[]>([]),
    [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [deleteTarget, setDeleteTarget] = useState<Exam | null>(null);
  const gate = useRef(false),
    origin = useRef(currentNamespace());
  const deleted = (data.jobs ?? [])
    .filter(
      (j) =>
        j.kind === 'exam-deletion' &&
        j.status === 'deleted' &&
        !data.exams.some((e) => e.id === j.examId),
    )
    .sort((a, b) => b.at.localeCompare(a.at));
  function edit(exam: Exam | null) {
    origin.current = currentNamespace();
    setError('');
    setSubject(exam?.subject ?? 'math');
    setScope(exam?.scope ?? []);
    setEditor(exam);
  }
  async function task(
    id: string,
    fn: () => Promise<unknown>,
    message: string,
    after?: () => void,
  ) {
    if (gate.current) return;
    gate.current = true;
    setBusy(id);
    setError('');
    const ns = origin.current;
    try {
      if (ns !== currentNamespace())
        throw Error('学习账户已切换，请重新打开考试安排');
      await fn();
      if (ns !== currentNamespace()) return;
      after?.();
      await refresh();
      notify(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作未保存，请重试');
    } finally {
      gate.current = false;
      setBusy('');
    }
  }
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      sim = String(f.get('simulation') || 'auto');
    await task(
      'save',
      () =>
        saveExamDetails(
          {
            title: String(f.get('title')),
            subject,
            date: String(f.get('date')),
            scope,
            target: Number(f.get('target')),
            dailyMinutes: Number(f.get('minutes')),
            simulation:
              subject === 'ce' && sim !== 'auto'
                ? {
                    exam: sim.split(':')[0] as any,
                    mapSection: sim.startsWith('MAP:')
                      ? (sim.split(':')[1] as any)
                      : undefined,
                    grade: sim.startsWith('MAP:')
                      ? Number(f.get('grade') || 8)
                      : undefined,
                    paperId:
                      editor?.simulation?.exam === sim.split(':')[0]
                        ? editor.simulation.paperId
                        : undefined,
                  }
                : undefined,
          },
          editor?.id,
          origin.current,
        ),
      editor ? '考试已更新，学习计划已重新计算' : '考试已加入学习计划',
      () => setEditor(undefined),
    );
  }
  const errorNotice = error ? (
    <p className="exam-action-error" role="alert">
      {error}
      <button
        type="button"
        className="quiet"
        disabled={!!busy}
        onClick={() => void task('reload', async () => {}, '考试列表已刷新')}
      >{tr("results:重新加载记录")}</button>
      <button type="button" className="quiet" onClick={() => setError('')}>{tr("results:关闭提示")}</button>
    </p>
  ) : null;
  return (
    <section className="panel exam-schedule alpha-exam-schedule">
      <div className="section-head">
        <h2>{tr("results:考试与学习计划")}</h2>
        <button
          className="primary"
          onClick={() => edit(null)}
          disabled={!!busy}
        >
          <Plus size={17} />{tr("results:添加考试")}</button>
      </div>
      <ExamResults />
      {editor === undefined && !deleteTarget && errorNotice}
      {!!deleted.length && (
        <div className="exam-undo-list" aria-label={tr("results:可撤销的考试删除")}>
          {deleted.map((j) => (
            <div key={j.id}>
              <span>{tr("results:已删除：")}{j.title}</span>
              <button
                className="secondary"
                disabled={!!busy}
                onClick={() => {
                  origin.current = currentNamespace();
                  void task(
                    'undo:' + j.id,
                    () => undoExamDeletion(j.id, origin.current),
                    '考试和原有成绩已恢复',
                  );
                }}
              >
                {busy === 'undo:' + j.id ? tr("results:恢复中…") : tr("results:撤销删除")}
              </button>
            </div>
          ))}
        </div>
      )}
      {data.exams.length ? (
        <div className="exam-schedule-list">
          {[...data.exams]
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((exam) => (
              <article className="exam-schedule-row" key={exam.id}>
                <div>
                  <h3>{exam.title}</h3>
                  <p>
                    {subjectName(exam.subject)} · {exam.date}{tr("results:· 目标")}{' '}
                    {exam.target}%
                  </p>
                  <small>
                    {exam.scope.length
                      ? tr("common:{{v0}} 个知识点",{v0:(exam.scope.length)})
                      : tr("results:全学科范围")}{' '}{tr("results:· 每日建议")}{exam.dailyMinutes}{tr("results:分钟")}</small>
                  <p className="exam-schedule-status">
                    {isExamScheduled(exam) ? tr("results:安排中") : tr("results:已取消安排")}
                    {exam.result
                      ? tr("common: · 实际得分 {{v0}} / {{v1}}，成绩仍计入 GPA",{v0:(exam.result.score),v1:(exam.result.maxScore)})
                      : tr("results: · 尚未录入成绩")}
                  </p>
                </div>
                <div className="exam-row-actions">
                  <button
                    className="secondary"
                    aria-label={'编辑考试 ' + exam.title}
                    disabled={!!busy}
                    onClick={() => edit(exam)}
                  >
                    <Pencil size={14} />{tr("results:编辑考试")}</button>
                  <button
                    className="quiet"
                    disabled={!!busy}
                    onClick={() => {
                      origin.current = currentNamespace();
                      void task(
                        'schedule:' + exam.id,
                        () =>
                          setExamScheduled(
                            exam.id,
                            !isExamScheduled(exam),
                            origin.current,
                          ),
                        isExamScheduled(exam)
                          ? '已取消学习安排，考试记录与成绩保留'
                          : '考试已重新加入安排',
                      );
                    }}
                  >
                    {busy === 'schedule:' + exam.id
                      ? tr("results:保存中…")
                      : isExamScheduled(exam)
                        ? tr("common:取消学习安排")
                        : tr("common:恢复学习安排")}
                  </button>
                  <button
                    className="quiet danger"
                    aria-label={'删除考试记录 ' + exam.title}
                    disabled={!!busy}
                    onClick={() => {
                      origin.current = currentNamespace();
                      setError('');
                      setDeleteTarget(exam);
                    }}
                  >
                    <Trash2 size={14} />{tr("results:删除记录")}</button>
                </div>
              </article>
            ))}
        </div>
      ) : (
        <p className="muted">{tr("results:添加考试日期、范围与目标，学习计划会据此安排。")}</p>
      )}
      <p className="muted exam-record-help">{tr("results:取消学习安排会停止后续安排与成绩提醒，保留成绩；删除记录会将该考试移出 GPA 统计，可在此撤销。")}</p>
      <Dialog
        open={editor !== undefined}
        onOpenChange={(v) => {
          if (!v && !busy) {
            setEditor(undefined);
            setError('');
          }
        }}
      >
        <DialogContent className="editor-dialog exam-editor-dialog">
          <DialogTitle>{editor ? tr("results:编辑考试") : tr("results:添加考试")}</DialogTitle>
          <DialogDescription>{tr("results:保存后重新计算学习计划，已有成绩不会被编辑表单覆盖。")}</DialogDescription>
          <form key={editor?.id ?? 'new'} onSubmit={save}>
            <fieldset disabled={!!busy}>
              <label>{tr("results:考试名称")}<input
                  name="title"
                  required
                  maxLength={100}
                  defaultValue={editor?.title ?? ''}
                />
              </label>
              <div className="form-grid">
                <label>{tr("results:学科")}<select
                    aria-label={tr("results:考试学科")}
                    value={subject}
                    onChange={(e) => {
                      setSubject(e.target.value as Subject);
                      setScope([]);
                    }}
                  >
                    {SUBJECTS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {tr('subjects:'+s.name)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>{tr("results:考试日期")}<input
                    type="date"
                    name="date"
                    required
                    defaultValue={editor?.date ?? ''}
                  />
                </label>
                <label>{tr("results:目标得分率（%）")}<input
                    name="target"
                    type="number"
                    min={1}
                    max={100}
                    required
                    defaultValue={editor?.target ?? 85}
                  />
                </label>
                <label>{tr("results:每日建议时间（分钟）")}<input
                    name="minutes"
                    type="number"
                    min={5}
                    max={180}
                    required
                    defaultValue={editor?.dailyMinutes ?? 20}
                  />
                </label>
              </div>
              {subject === 'ce' && (
                <div className="form-grid">
                  <label>{tr("results:配套模拟考试")}<select
                      name="simulation"
                      defaultValue={
                        editor?.simulation
                          ? editor.simulation.exam +
                            (editor.simulation.exam === 'MAP'
                              ? ':' + editor.simulation.mapSection
                              : '')
                          : 'auto'
                      }
                    >
                      <option value="auto">{tr("results:根据名称识别")}</option>
                      {[
                        'SAT',
                        'ACT',
                        'TOEFL',
                        'MAP:Reading',
                        'MAP:Language Usage',
                        'DET',
                      ].map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>{tr("results:MAP 年级")}<input
                      type="number"
                      name="grade"
                      min={2}
                      max={12}
                      defaultValue={editor?.simulation?.grade ?? 8}
                    />
                  </label>
                </div>
              )}
              <ExamScopePicker
                key={subject}
                subject={subject}
                value={scope}
                onChange={setScope}
              />
            </fieldset>
            {errorNotice}
            <button className="primary" type="submit" disabled={!!busy}>
              {busy === 'save' ? tr("results:正在保存…") : tr("results:保存考试安排")}
            </button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(v) => {
          if (!v && !busy) {
            setDeleteTarget(null);
            setError('');
          }
        }}
      >
        <DialogContent>
          <DialogTitle>{tr("results:删除考试记录？")}</DialogTitle>
          <DialogDescription>
            《{deleteTarget?.title}{tr("results:》将从考试记录和成绩统计中移除。")}{deleteTarget?.result ? tr("results:已有成绩也会暂时移出 GPA。") : ''}{tr("results:删除后可在考试安排中撤销。")}</DialogDescription>
          {errorNotice}
          <div className="exam-delete-actions">
            <button
              className="secondary"
              disabled={!!busy}
              onClick={() => setDeleteTarget(null)}
            >{tr("results:保留记录")}</button>
            <button
              className="danger secondary"
              disabled={!!busy}
              onClick={() => {
                if (deleteTarget)
                  void task(
                    'delete:' + deleteTarget.id,
                    () => deleteExamRecord(deleteTarget.id, origin.current),
                    '考试记录已删除，可以撤销',
                    () => setDeleteTarget(null),
                  );
              }}
            >
              {busy.startsWith('delete:') ? tr("results:删除中…") : tr("results:确认删除记录")}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
