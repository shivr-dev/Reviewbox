'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Clock3, FileCheck2, Pause } from 'lucide-react';
import { useReview } from './review-context';
import { newPaper, preparePaper } from '@/lib/exam-client';
import {
  EXAM_FORMAT,
  allSlots,
  examStages,
  paperReady,
  createRun,
  type ExamPaper,
  type ExamKind,
} from '@/lib/exam-model';
import { put, currentNamespace } from '@/lib/store';
import ExamImportPanel from './exam-import-panel';
import { createMapRun } from '@/lib/map-model';
export function FullExamHub() {
  const { data, refresh, navigate, notify, aiReady, sync } = useReview();
  const [exam, setExam] = useState<ExamKind>('SAT'),
    [writing, setWriting] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [allowGeneration, setAllowGeneration] = useState(false),
    [live, setLive] = useState<ExamPaper | null>(null);
  const [mapSection, setMapSection] = useState<'Reading' | 'Language Usage'>(
      'Reading',
    ),
    [grade, setGrade] = useState(8),
    [mapPractice, setMapPractice] = useState(false);
  const stop = useRef(false),
    lock = useRef(false);
  useEffect(
    () => () => {
      stop.current = true;
    },
    [],
  );
  const papers = (data.jobs ?? [])
    .filter(
      (j): j is ExamPaper =>
        j.kind === 'exam-paper' && j.format === EXAM_FORMAT,
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const matching = papers.filter(
    (p) =>
      p.exam === exam &&
      (exam !== 'ACT' || p.options.writing === writing) &&
      (exam !== 'MAP' ||
        (p.options.mapSection === mapSection && p.options.grade === grade)),
  );
  const shown =
    (live?.exam === exam &&
    (exam !== 'ACT' || live.options.writing === writing) &&
    (exam !== 'MAP' ||
      (live.options.mapSection === mapSection && live.options.grade === grade))
      ? live
      : null) ??
    matching.find((p) => paperReady(p, data.questions)) ??
    matching[0];
  const readyPaper = !!shown && paperReady(shown, data.questions);
  const stages = shown
    ? examStages(shown.exam, shown.options)
    : examStages(exam, { writing, mapSection, grade });
  const used =
    !!shown &&
    data.jobs?.some((j) => j.kind === 'exam-run' && j.paperId === shown.id);
  async function prepare(p?: ExamPaper) {
    if (lock.current || !allowGeneration || exam === 'TOEFL') return;
    const origin = currentNamespace();
    lock.current = true;
    setBusy(true);
    stop.current = false;
    try {
      const paper =
        p ??
        (await newPaper(
          exam,
          exam === 'MAP'
            ? { writing: false, mapSection, grade, count: 43, poolSize: 65 }
            : { writing },
          origin,
        ));
      if (currentNamespace() !== origin) return;
      setLive(paper);
      await refresh();
      const next = await preparePaper(
        paper,
        (v, s) => {
          setLive(v);
          setMessage(s);
        },
        stop,
        origin,
      );
      if (currentNamespace() !== origin) return;
      setLive(next);
      await refresh();
    } catch (e) {
      notify(e instanceof Error ? e.message : '准备未完成');
      await refresh();
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  async function enter(p: ExamPaper) {
    try {
      if (!paperReady(p, data.questions))
        throw new Error('本地试题尚未齐全，请先同步或继续准备');
      const active = data.jobs?.find(
        (j) =>
          j.kind === 'exam-run' &&
          j.paperId === p.id &&
          j.status !== 'complete' &&
          (p.exam !== 'MAP' || j.map?.practice === mapPractice),
      );
      const run =
        active ??
        (p.exam === 'MAP'
          ? createMapRun(p, data.questions, mapPractice)
          : createRun(p));
      await put('job', run);
      await refresh();
      navigate('exam', run.id);
    } catch (e) {
      notify(e instanceof Error ? e.message : '无法开始');
    }
  }
  return (
    <section className="full-exam-hub panel">
      <div className="section-head">
        <div>
          <p className="eyebrow">THE FULL TEST EXPERIENCE</p>
          <h2>英语专项模拟</h2>
          <p className="muted">
            使用已保存或导入的试卷，按模拟器完整流程作答，结束后查看解析。
          </p>
        </div>
        <FileCheck2 size={25} />
      </div>
      <div className="exam-kind-picker">
        {(['SAT', 'ACT', 'TOEFL', 'MAP', 'DET'] as const).map((k) => (
          <button
            key={k}
            disabled={busy}
            className={exam === k ? 'selected' : ''}
            onClick={() => {
              setExam(k);
              setLive(null);
            }}
          >
            <b>{k==='DET'?'Duolingo':k}</b>
            <span>
              {k === 'SAT'
                ? 'Reading and Writing · 54 questions'
                : k === 'ACT'
                  ? 'English & Reading · 86 questions'
                  : k === 'TOEFL'
                    ? 'Reading · Listening · Writing · Speaking'
                    : k==='DET'?'Reading · Listening · Writing · Speaking':'Reading · Language Usage'}
            </span>
          </button>
        ))}
      </div>
      {exam === 'MAP' && (
        <div className="map-hub-options">
          <div className="segmented" aria-label="MAP 科目">
            {(['Reading', 'Language Usage'] as const).map((s) => (
              <button
                key={s}
                className={s === mapSection ? 'active' : ''}
                onClick={() => {
                  setMapSection(s);
                  setLive(null);
                }}
                disabled={busy}
              >
                {s}
              </button>
            ))}
          </div>
          <label>
            Grade
            <select
              value={grade}
              disabled={busy}
              onChange={(e) => {
                setGrade(Number(e.target.value));
                setLive(null);
              }}
            >
              {Array.from({ length: 11 }, (_, i) => (
                <option key={i} value={i + 2}>
                  {i + 2}
                </option>
              ))}
            </select>
          </label>
          <label>
            模式
            <select
              value={mapPractice ? 'practice' : 'test'}
              onChange={(e) => setMapPractice(e.target.value === 'practice')}
            >
              <option value="test">自适应测试 · 结束后解析</option>
              <option value="practice">专项练习 · 逐题解析</option>
            </select>
          </label>
        </div>
      )}
      {exam === 'ACT' && (
        <div className="type-checkboxes">
          <label>
            <input
              type="checkbox"
              checked={writing}
              disabled={busy}
              onChange={(e) => {
                setWriting(e.target.checked);
                setLive(null);
              }}
            />
            Writing · 1 篇
          </label>
        </div>
      )}
      <div className="exam-blueprint">
        {stages.map((s) => (
          <div key={s.id}>
            <span>{s.title}</span>
            <b>
              {s.count} {s.section === 'Writing' ? '篇' : '题'}
            </b>
            <small>
              {exam==='DET'?'按任务计时':exam === 'MAP' ? '不设倒计时' : s.seconds / 60 + ' min'}
            </small>
          </div>
        ))}
      </div>
      <p className="muted exam-duration">
        <Clock3 size={14} />{' '}
        {exam==='DET'?'完整题型个人模拟，阅读与听力题组共享时间；不换算官方分数。':exam === 'MAP'
          ? '按照个人节奏完成；提交后不能返回上一题。'
          : '作答 ' + stages.reduce((n, s) => n + s.seconds, 0) / 60 + ' 分钟'}
        {exam === 'ACT' && writing ? ' · 写作前休息 5 分钟' : ''}
      </p>
      <div className="button-row">
        <button
          className="primary"
          disabled={busy || !readyPaper}
          onClick={() => shown && void enter(shown)}
        >
          {readyPaper ? '使用已保存试卷开始' : '暂无完整的已保存试卷'}
          <ArrowRight size={15} />
        </button>
        {busy && (
          <button
            className="secondary"
            onClick={() => {
              stop.current = true;
              setMessage('当前题组完成后暂停');
            }}
          >
            <Pause size={15} />
            暂停准备
          </button>
        )}
      </div>
      <p className="muted exam-reuse-note">
        同一试卷可以重复测试。开始测试会建立新的作答记录，无需重新生成题目。
      </p>
      {exam !== 'TOEFL' && (
        <details className="exam-about">
          <summary>试卷生成设置</summary>
          <label className="check-inline">
            <input
              type="checkbox"
              checked={allowGeneration}
              onChange={(e) => setAllowGeneration(e.target.checked)}
              disabled={busy}
            />
            允许生成新题（使用模型额度）
          </label>
          <p className="muted">
            默认关闭。已有试卷可直接复用；只有需要另一套题目时才启用。尚未完成的旧试卷会保留进度。
          </p>
          <button
            className="secondary"
            disabled={!allowGeneration || busy || !aiReady}
            onClick={() => void prepare()}
          >
            编制一份新试卷
          </button>
        </details>
      )}
      <ExamImportPanel
        key={exam + '-' + mapSection + '-' + grade}
        exam={exam}
        mapSection={mapSection}
        grade={grade}
        onImported={(p) => {
          setExam(p.exam);
          setWriting(p.options.writing);
          if (p.exam === 'MAP') {
            setMapSection(p.options.mapSection ?? 'Reading');
            setGrade(p.options.grade ?? 8);
          }
          setLive(p);
        }}
      />
      {shown && (
        <div className="paper-progress">
          <div className="section-head">
            <b>
              {shown.title ?? shown.exam} ·{' '}
              {shown.options.writing ? '含 Writing · ' : ''}
              {new Date(shown.createdAt).toLocaleDateString()}
            </b>
            <span>
              {Object.keys(shown.questions).length}/{allSlots(shown).length}{' '}
              {shown.origin === 'imported' ? '已导入' : '已核验'}
            </span>
          </div>
          <progress
            max={allSlots(shown).length}
            value={Object.keys(shown.questions).length}
          />
          <p className="muted">
            {busy
              ? message
              : (shown.error ??
                (paperReady(shown, data.questions)
                  ? '完整试卷已保存，可离线进入考场。'
                  : '可继续上次的准备进度。'))}
            {shown.exam === 'SAT' && !shown.origin
              ? ' 题池含第二模块的两条难度路线，实际作答 54 题。'
              : ''}
          </p>
          <button
            className="secondary"
            disabled={
              busy ||
              (!used &&
                !paperReady(shown, data.questions) &&
                (!aiReady || !allowGeneration))
            }
            onClick={() =>
              paperReady(shown, data.questions)
                ? void enter(shown)
                : used
                  ? void sync()
                  : void prepare(shown)
            }
          >
            {paperReady(shown, data.questions)
              ? '进入考场'
              : used
                ? '同步恢复原试卷'
                : '继续准备这份试卷'}
          </button>
        </div>
      )}
      <details className="exam-about">
        <summary>考试说明与历史试卷</summary>
        {exam === 'MAP' && (
          <p>
            MAP 模拟采用不设倒计时、逐题提交及本地题池自适应选题。新题池默认保存
            65 题，实际作答 43 题；较短的导入卷标记为专项练习。Reading
            涵盖文学、信息文本与词汇，Language Usage
            涵盖写作修订、语法与书写规范。题池未使用官方标定参数，报告不提供 RIT
            分数。界面参考 NWEA 公开练习版，内容为私人学习材料。
          </p>
        )}
        <p>
          保留现行 SAT / ACT 的完整英语部分，使用原创题目。SAT
          两模块直接衔接；ACT English 与 Reading 直接衔接，选考 Writing
          时写作前休息 5 分钟。这是英语专项编排。SAT 参照 Bluebook 布局，ACT
          参照国际 CBT
          布局；地区与平台版本可能有差异。成绩显示本卷正确率，不作官方分数换算。SAT
          第二模块以本卷正确率 65% 作为模拟分流阈值。
        </p>
        <p>
          首次准备整套题目需要数分钟至数十分钟，视模型速度与核验重试而定；可以暂停并续接。正式计时开始后，关闭页面不会暂停考试。
        </p>
        <div className="source-links">
          <a
            href="https://studentresources.nwea.org/"
            target="_blank"
            rel="noreferrer"
          >
            MAP 官方练习说明
          </a>
          <a
            href="https://satsuite.collegeboard.org/sat/whats-on-the-test/structure"
            target="_blank"
            rel="noreferrer"
          >
            SAT 结构
          </a>
          <a
            href="https://www.act.org/content/act/en/products-and-services/the-act/test-preparation/act-exam-sections-and-structure.html"
            target="_blank"
            rel="noreferrer"
          >
            ACT 结构
          </a>
        </div>
        {papers.map((p) => (
          <div className="service-row" key={p.id}>
            <span>
              {p.exam} · {new Date(p.createdAt).toLocaleString()} ·{' '}
              {Object.keys(p.questions).length}/{allSlots(p).length}
            </span>
            <button
              className="quiet"
              disabled={busy}
              onClick={() => {
                setExam(p.exam);
                setWriting(p.options.writing);
                if (p.exam === 'MAP') {
                  setMapSection(p.options.mapSection ?? 'Reading');
                  setGrade(p.options.grade ?? 8);
                }
                setLive(p);
              }}
            >
              查看
            </button>
          </div>
        ))}
        {data.jobs
          ?.filter(
            (j) =>
              j.kind === 'exam-run' &&
              j.status === 'complete' &&
              papers.some((p) => p.id === j.paperId),
          )
          .map((j) => (
            <button
              className="quiet"
              key={j.id}
              onClick={() => navigate('exam', j.id)}
            >
              查看 {j.exam} 成绩 ·{' '}
              {new Date(j.completedAt).toLocaleDateString()}
            </button>
          ))}
      </details>
    </section>
  );
}
