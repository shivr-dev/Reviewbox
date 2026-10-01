'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Eraser,
  Highlighter,
  ListMinus,
  Minus,
  Plus,
  RotateCw,
  StickyNote,
  X,
  PanelTop,
  LogOut,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { useReview } from './review-context';
import { put, currentNamespace } from '@/lib/store';
import { examStages, type ExamPaper, type ExamRun } from '@/lib/exam-model';
import {
  advanceMap,
  mapAnswered,
  mapAnswerText,
  mapScore,
} from '@/lib/map-model';
function arrayAnswer(answer: string): string[] {
  try {
    const a = JSON.parse(answer);
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}
function Marked({ text, marks }: { text: string; marks: string[] }) {
  const ranges = marks
    .flatMap((mark) => {
      const xs: { a: number; b: number }[] = [];
      let a = text.indexOf(mark);
      while (mark && a >= 0) {
        xs.push({ a, b: a + mark.length });
        a = text.indexOf(mark, a + mark.length);
      }
      return xs;
    })
    .sort((a, b) => a.a - b.a);
  let pos = 0;
  const out: React.ReactNode[] = [];
  for (const r of ranges) {
    if (r.a < pos) continue;
    out.push(
      text.slice(pos, r.a),
      <mark key={r.a}>{text.slice(r.a, r.b)}</mark>,
    );
    pos = r.b;
  }
  out.push(text.slice(pos));
  return <>{out}</>;
}
export default function MapExamRoom({
  run: initial,
  paper,
}: {
  run: ExamRun;
  paper: ExamPaper;
}) {
  const { data, refresh, navigate } = useReview();
  const [run, setRun] = useState(initial),
    [tool, setTool] = useState(''),
    [modal, setModal] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [readerY, setReaderY] = useState(200),
    [word, setWord] = useState(''),
    [launching, setLaunching] = useState(false);
  const ref = useRef(run),
    ns = useRef(currentNamespace()),
    writes = useRef(Promise.resolve()),
    start = useRef(0),
    alive = useRef(true),
    visible = useRef(true),
    lock = useRef(false),
    surface = useRef<HTMLDivElement>(null);
  const stage = examStages('MAP', paper.options)[0],
    slot = stage.slots.find((s) => s.id === run.map?.order[run.index]);
  const q = data.questions.find(
    (q) => q.id === paper.questions[slot?.id ?? ''],
  );
  const item = q?.examTask?.map;
  const answer = run.answers[slot?.id ?? ''] ?? '',
    values = arrayAnswer(answer);
  const zoom = run.map?.tools?.zoom ?? 100,
    reader = run.map?.tools?.reader ?? false;
  const marks = run.highlights?.[slot?.id ?? ''] ?? [],
    excluded = run.eliminated[slot?.id ?? ''] ?? [];
  function persist(next: ExamRun, confirmed = false) {
    if (currentNamespace() !== ns.current)
      return Promise.reject(Error('账户已切换，请返回当前学习空间。'));
    if (!confirmed) {
      ref.current = next;
      setRun(next);
    }
    writes.current = writes.current
      .catch(() => {})
      .then(async () => {
        await put('job', next, next.id, false, ns.current);
        if (confirmed && alive.current) {
          ref.current = next;
          setRun(next);
        }
      });
    writes.current.catch(() => {
      if (alive.current) setError('本地保存未完成，请保留页面并重试。');
    });
    return writes.current;
  }
  function patch(fields: Partial<ExamRun>) {
    void persist({ ...ref.current, ...fields }).catch(() => {});
  }
  function setAnswer(value: string) {
    if (lock.current || run.map?.checked) return;
    patch({ answers: { ...ref.current.answers, [slot!.id]: value } });
  }
  function capture(force: unknown = false) {
    if (lock.current && force !== true) return;
    const r = ref.current,
      id = r.map?.order[r.index];
    if (!id || r.status !== 'active' || !r.map?.entered || r.map.checked)
      return;
    const delta = visible.current ? Date.now() - start.current : 0;
    start.current = Date.now();
    patch({
      times: { ...r.times, [id]: (r.times[id] ?? 0) + Math.max(0, delta) },
    });
  }
  useEffect(() => {
    alive.current = true;
    visible.current = !document.hidden;
    start.current = Date.now();
    const tick = setInterval(capture, 10000);
    const visibility = () => {
      capture();
      visible.current = !document.hidden;
      start.current = Date.now();
    };
    window.addEventListener('pagehide', capture);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      alive.current = false;
      clearInterval(tick);
      window.removeEventListener('pagehide', capture);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  async function exit() {
    capture();
    try {
      await writes.current;
      await put('job', ref.current, run.id, false, ns.current);
      await refresh();
      navigate('subjects', 'ce');
    } catch {
      setError('保存未完成，请重试后离开。');
    }
  }
  async function next() {
    if (lock.current || !q || !slot || !mapAnswered(q, answer)) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      capture(true);
      await writes.current;
      const current = ref.current;
      if (current.map?.practice && !current.map.checked)
        await persist(
          { ...current, map: { ...current.map, checked: true } },
          true,
        );
      else {
        const next = advanceMap(paper, current, data.questions);
        await persist(next, true);
        start.current = Date.now();
        setWord('');
        if (next.status === 'complete') await refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存暂未完成。');
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  function highlight() {
    const s = window.getSelection();
    if (!s?.anchorNode || !surface.current?.contains(s.anchorNode)) return;
    const value = s.toString().trim().slice(0, 1500);
    if (value) {
      patch({
        highlights: {
          ...ref.current.highlights,
          [slot!.id]: [...new Set([...marks, value])],
        },
      });
      s.removeAllRanges();
    }
  }
  function tools(next: { zoom?: number; reader?: boolean }) {
    patch({ map: { ...ref.current.map!, tools: { zoom, reader, ...next } } });
  }
  function eliminate(key: string) {
    patch({
      eliminated: {
        ...ref.current.eliminated,
        [slot!.id]: excluded.includes(key)
          ? excluded.filter((k) => k !== key)
          : [...excluded, key],
      },
    });
  }
  function choiceRows(
    choices: string[],
    selected: string | string[],
    change: (v: string) => void,
    prefix = '',
  ) {
    return (
      <div className="map-choices">
        {choices.map((c, i) => {
          const key = prefix + i,
            on = Array.isArray(selected)
              ? selected.includes(c)
              : selected === c;
          return (
            <div
              className={
                'map-choice ' +
                (on ? 'chosen ' : '') +
                (excluded.includes(key) ? 'eliminated' : '')
              }
              key={key}
            >
              {tool === 'eliminate' && (
                <button
                  className="map-eliminate"
                  aria-label={'排除选项 ' + (i + 1)}
                  onClick={() => eliminate(key)}
                >
                  <X size={18} />
                </button>
              )}
              <label>
                <input
                  disabled={busy || !!run.map?.checked}
                  type={Array.isArray(selected) ? 'checkbox' : 'radio'}
                  name={'map-' + prefix}
                  checked={on}
                  onChange={() => change(c)}
                />
                <span>{i + 1}.</span>
                <span>{c}</span>
              </label>
            </div>
          );
        })}
      </div>
    );
  }
  function fill(index: number, value: string) {
    const a = Array.from(
      { length: (item?.answer as string[])?.length ?? 0 },
      (_, i) => values[i] ?? '',
    );
    const old = a.findIndex((v) => v === value);
    if (old >= 0) a[old] = '';
    a[index] = value;
    setAnswer(JSON.stringify(a));
    setWord('');
  }
  function passage(text: string) {
    if (item?.type === 'gap_match')
      return text.split(/(\{\{\d+\}\})/).map((part, i) => {
        const m = part.match(/^\{\{(\d+)\}\}$/);
        if (!m) return <Marked key={i} text={part} marks={marks} />;
        const index = Number(m[1]) - 1;
        return (
          <button
            key={i}
            className={'map-gap ' + (values[index] ? 'filled' : '')}
            disabled={!!run.map?.checked}
            aria-label={'填空 ' + (index + 1)}
            onClick={() => (word ? fill(index, word) : fill(index, ''))}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const v = e.dataTransfer.getData('text/plain');
              if (item.choices?.includes(v)) fill(index, v);
            }}
          >
            {values[index] || '\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0'}
          </button>
        );
      });
    if (item?.type === 'hot_text')
      return text.split(/(\[[^\]]+\])/).map((part, i) => {
        const token = part.slice(1, -1);
        if (!part.startsWith('[') || !item.tokens?.includes(token))
          return <Marked key={i} text={part} marks={marks} />;
        const selected = item.correction ? values[0] : answer;
        return (
          <button
            className={'map-hot ' + (selected === token ? 'selected' : '')}
            key={i}
            disabled={!!run.map?.checked}
            onClick={() =>
              setAnswer(
                item.correction
                  ? JSON.stringify([token, values[1] ?? ''])
                  : token,
              )
            }
          >
            [ {token} ]
          </button>
        );
      });
    return <Marked text={text} marks={marks} />;
  }
  if (!run.map || !q || !item || !slot)
    return (
      <main className="exam-empty">
        <h1>MAP 本地题目暂未齐全</h1>
        <p>请同步或重新导入完整题池后继续。</p>
        <button onClick={() => void exit()}>返回 CE</button>
      </main>
    );
  if (launching)
    return (
      <main className="map-boot" role="status">
        <div className="map-tiles" aria-hidden="true">
          {Array.from({ length: 9 }, (_, i) => (
            <i key={i} style={{ animationDelay: `${i * 70}ms` }} />
          ))}
        </div>
        <p>Loading, please wait. . .</p>
      </main>
    );
  if (!run.map.entered)
    return (
      <main className="map-checkin">
        <section>
          <button
            className="map-checkin-close"
            aria-label="返回 CE"
            onClick={() => void exit()}
          >
            <X />
          </button>
          <div className="map-wordmark">
            MAP <small>学习模拟</small>
          </div>
          <div className="map-checkin-form">
            <p>Practice / Adaptive Simulation</p>
            <h1>{stage.section}</h1>
            <label>
              Student
              <input value={data.settings.name || 'Student Guest'} readOnly />
            </label>
            <label>
              Grade
              <input value={paper.options.grade ?? 8} readOnly />
            </label>
            <p>
              不设倒计时；提交下一题后，本题答案锁定。
              {run.map.practice
                ? '练习模式会在提交后显示解析。'
                : '全部完成后查看解析。'}
            </p>
            <button
              className="map-start"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setLaunching(true);
                try {
                  await Promise.all([
                    persist(
                      {
                        ...run,
                        map: { ...run.map!, entered: true },
                      },
                      true,
                    ),
                    new Promise((resolve) => setTimeout(resolve, 220)),
                  ]);
                  start.current = Date.now();
                } catch {
                  setError('无法保存，请重试。');
                } finally {
                  setBusy(false);
                  setLaunching(false);
                }
              }}
            >
              Start <ArrowRight />
            </button>
            {error && <p role="alert">{error}</p>}
          </div>
        </section>
      </main>
    );
  const split =
    stage.section === 'Reading' &&
    !!q.passage &&
    !['gap_match', 'hot_text'].includes(item.type);
  return (
    <main className="map-room">
      <div className="map-surface" ref={surface}>
        <header className="map-toolbar">
          <button
            aria-label="缩小"
            disabled={zoom <= 80}
            onClick={() => tools({ zoom: zoom - 10 })}
          >
            <Minus />
          </button>
          <output>{zoom}%</output>
          <button
            aria-label="放大"
            disabled={zoom >= 160}
            onClick={() => tools({ zoom: zoom + 10 })}
          >
            <Plus />
          </button>
          <i />
          <button
            title="高亮文字"
            aria-label="高亮文字"
            aria-pressed={tool === 'highlight'}
            onClick={() => setTool(tool === 'highlight' ? '' : 'highlight')}
          >
            <Highlighter />
          </button>
          <button
            title="清除高亮"
            aria-label="清除高亮"
            onClick={() => {
              patch({ highlights: { ...run.highlights, [slot.id]: [] } });
              setTool('');
            }}
          >
            <Eraser />
          </button>
          <button
            title="阅读辅助线"
            aria-label="阅读辅助线"
            aria-pressed={reader}
            onClick={() => tools({ reader: !reader })}
          >
            <PanelTop />
          </button>
          <button
            title="笔记"
            aria-label="笔记"
            aria-pressed={modal === 'notes'}
            onClick={() => setModal('notes')}
          >
            <StickyNote />
          </button>
          <button
            title="排除选项"
            aria-label="排除选项"
            aria-pressed={tool === 'eliminate'}
            onClick={() => setTool(tool === 'eliminate' ? '' : 'eliminate')}
          >
            <ListMinus />
          </button>
          <button
            className="map-exit"
            title="保存并离开"
            aria-label="保存并离开"
            onClick={() => void exit()}
          >
            <LogOut size={20} />
          </button>
        </header>
        <section
          className={'map-item ' + (split ? 'split' : '')}
          key={slot.id}
          style={{ fontSize: `${(1.125 * zoom) / 100}rem` }}
          onPointerUp={() => {
            if (tool === 'highlight') highlight();
          }}
          onPointerMove={(e) => {
            if (reader)
              setReaderY(
                e.clientY - surface.current!.getBoundingClientRect().top,
              );
          }}
        >
          <div className="map-instruction">
            {item.instruction ?? (q.passage ? 'Read the passage.' : q.prompt)}
          </div>
          {q.passage && (
            <article className="map-passage">
              <h2>{item.passageTitle}</h2>
              {item.image && (
                <figure>
                  {/* A private imported data image must remain local and needs no remote image optimizer. */}
                  {/* oxlint-disable-next-line next/no-img-element */}
                  <img src={item.image} alt={item.imageAlt ?? ''} />
                </figure>
              )}
              <div className="map-prose">{passage(q.passage)}</div>
            </article>
          )}
          <div className="map-response">
            <p className="map-prompt">{q.prompt}</p>
            {item.type === 'mcq' &&
              choiceRows(item.choices!, answer, setAnswer)}
            {item.type === 'multi_select' && (
              <>
                <p>
                  Select {item.selectCount ?? (item.answer as string[]).length}{' '}
                  answers.
                </p>
                {choiceRows(item.choices!, values, (c) => {
                  const limit =
                    item.selectCount ?? (item.answer as string[]).length;
                  setAnswer(
                    JSON.stringify(
                      values.includes(c)
                        ? values.filter((v) => v !== c)
                        : values.length < limit
                          ? [...values, c]
                          : values,
                    ),
                  );
                })}
              </>
            )}
            {item.type === 'two_part' && (
              <>
                <p>
                  This question has two parts. Answer Part A, and then answer
                  Part B.
                </p>
                {item.parts!.map((p, i) => (
                  <section className="map-part" key={i}>
                    <u>Part {i ? 'B' : 'A'}</u>
                    <p>{p.prompt}</p>
                    {choiceRows(
                      p.choices,
                      values[i] ?? '',
                      (v) => {
                        const a = [values[0] ?? '', values[1] ?? ''];
                        a[i] = v;
                        setAnswer(JSON.stringify(a));
                      },
                      'part-' + i + '-',
                    )}
                  </section>
                ))}
              </>
            )}
            {item.type === 'gap_match' && (
              <div className="map-wordbank" aria-label="词块库">
                {item.choices!.map((c) => (
                  <button
                    key={c}
                    draggable={!run.map?.checked}
                    disabled={values.includes(c) || !!run.map?.checked}
                    className={word === c ? 'selected' : ''}
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', c)}
                    onClick={() => setWord(word === c ? '' : c)}
                  >
                    {c}
                  </button>
                ))}
                <small>
                  Drag a word into a blank, or select a word and then a blank.
                </small>
              </div>
            )}
            {item.type === 'text_entry' && (
              <label className="map-text-entry">
                Your answer
                <input
                  aria-label="Your answer"
                  disabled={!!run.map?.checked}
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                />
              </label>
            )}
            {item.type === 'hot_text' && item.correction && (
              <label className="map-text-entry">
                Enter a word that will correct the error.
                <input
                  aria-label="Correct the error"
                  disabled={!!run.map?.checked}
                  value={values[1] ?? ''}
                  onChange={(e) =>
                    setAnswer(JSON.stringify([values[0] ?? '', e.target.value]))
                  }
                />
              </label>
            )}
            {run.map.checked && (
              <aside className="map-practice-feedback">
                <b>
                  {mapScore(q, answer) === 1 ? 'Correct' : 'Review this answer'}
                </b>
                <p>{mapAnswerText(q)}</p>
                <p>{q.explanation}</p>
              </aside>
            )}
          </div>
        </section>
        {reader && (
          <div
            className="map-reader"
            style={{ top: Math.max(78, readerY) }}
            aria-hidden="true"
          />
        )}
        {busy && (
          <output className="map-loading">
            <div>
              <span className="map-spinner" />
              Loading
            </div>
          </output>
        )}
      </div>
      <footer className="map-footer">
        <div>
          <button
            className="map-reset"
            onClick={() => setModal('reset')}
            disabled={busy || !!run.map.checked}
          >
            <RotateCw /> RESET
          </button>
          <span>{data.settings.name || 'Student Guest'}</span>
          <span>{run.map.practice ? 'Practice' : 'Adaptive Simulation'}</span>
          <span>Grade {paper.options.grade ?? 8}</span>
          <span>{stage.section}</span>
          <strong>Question # {run.index + 1}</strong>
          <button
            className="map-next"
            aria-label={
              run.map.practice && !run.map.checked
                ? '提交并核对答案'
                : '提交并进入下一题'
            }
            disabled={busy || !mapAnswered(q, answer)}
            onClick={() => void next()}
          >
            <ArrowRight size={28} />
          </button>
        </div>
      </footer>
      {error && (
        <div className="map-error" role="alert">
          {error}
          <button onClick={() => setError('')} aria-label="关闭错误提示">
            <X size={18} />
          </button>
          <button onClick={() => void next()}>重试</button>
        </div>
      )}
      <Dialog
        open={!!modal}
        onOpenChange={(open) => {
          if (!open) setModal('');
        }}
      >
        <DialogContent className="map-dialog">
          <DialogTitle>
            {modal === 'reset' ? 'Reset Question' : 'Notes'}
          </DialogTitle>
          <DialogDescription>
            {modal === 'reset'
              ? 'Are you sure you want to clear your answer?'
              : 'Notes are saved with this question.'}
          </DialogDescription>
          {modal === 'reset' ? (
            <div className="map-modal-actions">
              <button
                className="map-confirm-reset"
                onClick={() => {
                  setAnswer('');
                  setWord('');
                  setModal('');
                }}
              >
                <RotateCw /> RESET
              </button>
              <button onClick={() => setModal('')}>CANCEL</button>
            </div>
          ) : (
            <textarea
              aria-label="Notes"
              rows={9}
              value={run.notes[slot.id] ?? ''}
              onChange={(e) =>
                patch({
                  notes: {
                    ...ref.current.notes,
                    [slot.id]: e.target.value.slice(0, 10000),
                  },
                })
              }
            />
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
