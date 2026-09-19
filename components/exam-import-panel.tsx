'use client';
import { useRef, useState } from 'react';
import ImportTemplates from './import-templates';
import { useReview } from './review-context';
import {
  installExamImport,
  parseExamPackage,
  readExamFile,
  smartExamText,
  type ExamImport,
} from '@/lib/exam-import';
import { EXAM_IMPORT_SKILL } from '@/lib/exam-skill';
import { currentNamespace } from '@/lib/store';
import type { ExamKind, ExamPaper } from '@/lib/exam-model';
export default function ExamImportPanel({
  exam,
  onImported,
}: {
  exam: ExamKind;
  onImported: (paper: ExamPaper) => void;
}) {
  const { refresh, notify } = useReview();
  const [mode, setMode] = useState('smart'),
    [source, setSource] = useState(''),
    [preview, setPreview] = useState<ExamImport | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [title, setTitle] = useState(''),
    [section, setSection] = useState('Reading'),
    [minutes, setMinutes] = useState(30),
    [passage, setPassage] = useState(''),
    [prompt, setPrompt] = useState(''),
    [options, setOptions] = useState(''),
    [answer, setAnswer] = useState(''),
    [explanation, setExplanation] = useState(''),
    [items, setItems] = useState<any[]>([]),
    [sections, setSections] = useState<any[]>([]);
  const namespace = useRef(currentNamespace());
  async function inspect(work: () => Promise<ExamImport>) {
    setBusy(true);
    setError('');
    setPreview(null);
    try {
      setPreview(await work());
      namespace.current = currentNamespace();
    } catch (e) {
      setError(
        e && typeof e === 'object' && 'issues' in e
          ? '题目格式不符合要求，请检查字段长度、选项数量、难度和评分标准。'
          : e instanceof Error
            ? e.message
            : '导入内容无法识别。',
      );
    } finally {
      setBusy(false);
    }
  }
  function addQuestion() {
    const choices = options
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!prompt.trim() || !answer.trim() || !explanation.trim()) {
      setError('请填写题干、答案和解析。');
      return;
    }
    setItems([
      ...items,
      {
        id: 'q' + items.length,
        type: choices.length
          ? 'mcq'
          : exam === 'TOEFL'
            ? 'write_email'
            : 'free_response',
        prompt,
        passage,
        choices: choices.length ? choices : undefined,
        answer,
        explanation,
        skill: section,
      },
    ]);
    setPrompt('');
    setOptions('');
    setAnswer('');
    setExplanation('');
    setError('');
  }
  function sectionValue() {
    return {
      id: 'section' + sections.length,
      label: section,
      type:
        exam === 'SAT'
          ? 'bluebook'
          : exam === 'ACT'
            ? section === 'Writing'
              ? 'act-writing'
              : 'act'
            : 'toefl-' + section.toLowerCase(),
      durationSeconds: minutes * 60,
      count: items.length,
      questions: items,
    };
  }
  return (
    <details className="exam-import panel">
      <summary>导入试卷 · 手动 / 智能识别</summary>
      <p className="muted">
        支持 JSON、带音频的试卷 ZIP
        或编号选择题文本。先检查内容，再保存为私人试卷；不会调用 AI 重新生成。
      </p>
      <div className="button-row">
        <button
          className={mode === 'smart' ? 'primary' : 'secondary'}
          onClick={() => setMode('smart')}
        >
          智能导入
        </button>
        <button
          className={mode === 'manual' ? 'primary' : 'secondary'}
          onClick={() => setMode('manual')}
        >
          手动录入
        </button>
        <button
          className="quiet"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(EXAM_IMPORT_SKILL);
              notify('考试包出题 Skill 已复制');
            } catch {
              setSource(EXAM_IMPORT_SKILL);
              setError('剪贴板不可用，请在文本框中手动复制。');
            }
          }}
        >
          复制考试包 Skill
        </button>
      </div>
      {mode === 'smart' ? (
        <>
          <ImportTemplates exam onUse={setSource} />
          <label className="field">
            试卷文件
            <input
              type="file"
              accept=".json,.zip"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void inspect(() => readExamFile(f));
                e.target.value = '';
              }}
            />
          </label>
          <label className="field">
            粘贴完整试卷或题目
            <textarea
              rows={8}
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder={
                '1. Question\nA. First choice\nB. Second choice\n答案：A\n解析：Explanation'
              }
            />
          </label>
          <button
            className="secondary"
            disabled={busy || !source.trim()}
            onClick={() => void inspect(() => smartExamText(source, exam))}
          >
            识别并预览
          </button>
        </>
      ) : (
        <>
          <div className="exam-form-grid">
            <label className="field">
              试卷名称
              <input value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="field">
              当前部分
              <select
                value={section}
                onChange={(e) => setSection(e.target.value)}
              >
                {(exam === 'SAT'
                  ? ['Reading and Writing']
                  : exam === 'ACT'
                    ? ['English', 'Reading', 'Writing']
                    : ['Reading', 'Listening', 'Writing', 'Speaking']
                ).map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="field">
              时间（分钟）
              <input
                type="number"
                min={1}
                max={240}
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
              />
            </label>
          </div>
          <p className="muted">
            表单适合选择题和写作。补词、组句、听力音频与口语请使用试卷文件导入，格式可从上方
            Skill 复制。
          </p>
          <label className="field">
            共享材料
            <textarea
              value={passage}
              onChange={(e) => setPassage(e.target.value)}
            />
          </label>
          <label className="field">
            题干
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </label>
          <label className="field">
            选项（每行一个；写作留空）
            <textarea
              value={options}
              onChange={(e) => setOptions(e.target.value)}
            />
          </label>
          <label className="field">
            完整正确选项 / 参考答案
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
            />
          </label>
          <label className="field">
            解析
            <textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
            />
          </label>
          <div className="button-row">
            <button className="secondary" onClick={addQuestion}>
              加入当前部分（{items.length}）
            </button>
            <button
              className="secondary"
              disabled={!items.length}
              onClick={() => {
                setSections([...sections, sectionValue()]);
                setItems([]);
                setPassage('');
              }}
            >
              完成此部分
            </button>
            <button
              className="primary"
              disabled={busy || (!items.length && !sections.length)}
              onClick={() =>
                void inspect(() => {
                  const all = items.length
                    ? [...sections, sectionValue()]
                    : sections;
                  return parseExamPackage({
                    schemaVersion: 1,
                    exam,
                    title: title || exam + ' 手动试卷',
                    flow: all.map(({ questions, ...s }) => s),
                    sectionsInline: Object.fromEntries(
                      all.map((s) => [s.id, { questions: s.questions }]),
                    ),
                  });
                })
              }
            >
              预览整卷
            </button>
          </div>
          <p className="muted">
            已完成 {sections.length} 个部分；当前部分 {items.length} 题。
          </p>
        </>
      )}
      {error && (
        <p role="alert" className="import-error">
          {error}
        </p>
      )}
      {busy && <p role="status">正在检查试卷…</p>}
      {preview && (
        <div className="paper-progress">
          <h3>{preview.paper.title}</h3>
          <p>
            {preview.paper.exam} · {preview.paper.options.stages?.length} 个部分
            · {preview.questions.length} 页题目
          </p>
          {preview.warnings.map((w) => (
            <p key={w} className="muted">
              {w}
            </p>
          ))}
          <button
            className="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await installExamImport(preview, namespace.current);
                await refresh();
                onImported(preview.paper);
                setPreview(null);
                notify('私人试卷已保存，可以直接开始。');
              } catch (e) {
                setError(e instanceof Error ? e.message : '保存失败');
              } finally {
                setBusy(false);
              }
            }}
          >
            保存试卷
          </button>
        </div>
      )}
    </details>
  );
}
