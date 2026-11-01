'use client';
import { trackProductEvent } from '@/lib/product-insights';
import { useEffect, useRef, useState, useCallback } from 'react';
import type { Question } from '@/lib/model';
import { uid } from '@/lib/model';
import { useReview } from './review-context';
import { currentNamespace, put } from '@/lib/store';
import { moveItem } from '@/lib/pack-studio';
import {
  A4,
  publicationPoints,
  type PublishingLayout,
  type QuestionPageStyle,
} from '@/lib/exam-publishing';
import type { ExportImage } from '@/lib/export-docx';
import MathText from './math-text';
import { bioAssetCredit } from '@/lib/bioicons';
import { usePreparedDownload, PreparedDownload } from './prepared-download';
const DEFAULT_STYLE: QuestionPageStyle = {
  imageWidth: 80,
  answerLines: 3,
  breakBefore: false,
};
const STEP = A4.width + 52;
function PaperImage({
  image,
  width,
  onLoad,
}: {
  image: ExportImage;
  width: number;
  onLoad: () => void;
}) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    const url = URL.createObjectURL(
      new Blob(
        [
          Uint8Array.from(image.type === 'svg' ? image.data : image.data)
            .buffer,
        ],
        {
          type:
            image.type === 'svg'
              ? 'image/svg+xml'
              : image.type === 'jpg'
                ? 'image/jpeg'
                : 'image/png',
        },
      ),
    );
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);
  return (
    <img
      src={src}
      style={{ width: width + '%', maxHeight: 340, objectFit: 'contain' }}
      alt={image.alt}
      onLoad={onLoad}
    />
  );
}
export default function ExamPublishingStudio() {
  const { data, subject, navigate, notify, refresh } = useReview(),
    ns = currentNamespace(),
    [id, setId] = useState('publishing-draft:' + uid()),
    [title, setTitle] = useState(''),
    [header, setHeader] = useState('Reviewbox'),
    [numbers, setNumbers] = useState(true),
    [minutes, setMinutes] = useState(60),
    [search, setSearch] = useState(''),
    [scope, setScope] = useState('all'),
    [ids, setIds] = useState<string[]>([]),
    [styles, setStyles] = useState<Record<string, QuestionPageStyle>>({}),
    [selected, setSelected] = useState(''),
    [images, setImages] = useState<Record<string, ExportImage[]>>({}),
    [signatures, setSignatures] = useState<Record<string, string>>({}),
    [pages, setPages] = useState<string[][]>([[]]),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(''),
    [error, setError] = useState(''),
    [zoom, setZoom] = useState(85);
  const download = usePreparedDownload(ns);
  const flow = useRef<HTMLDivElement>(null),
    controller = useRef<AbortController | undefined>(undefined),
    origin = useRef(ns);
  const all = data.questions.filter(
      (q) =>
        q.reviewStatus !== 'paused' &&
        (subject === 'all' || q.subject === subject),
    ),
    members = data.packs.find((p) => p.id === scope)?.questionIds,
    catalog = all.filter(
      (q) =>
        (!members || members.includes(q.id)) &&
        (q.prompt + ' ' + q.answer)
          .toLowerCase()
          .includes(search.toLowerCase()),
    ),
    byId = new Map(all.map((q) => [q.id, q])),
    questions = ids.flatMap((id) => (byId.get(id) ? [byId.get(id)!] : [])),
    active = byId.get(selected),
    signature = (q: Question) =>
      JSON.stringify({
        diagram: q.diagram,
        media: q.media,
        diagramChoice: q.diagramChoice,
      }),
    missing = questions.filter(
      (q) =>
        (q.diagram || q.media?.length) && signatures[q.id] !== signature(q),
    );
  const drafts = (data.jobs ?? []).filter(
    (j) => j.kind === 'exam-publishing-draft',
  );
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (origin.current !== ns) {
      controller.current?.abort();
      setIds([]);
      setStyles({});
      setImages({});
      setSignatures({});
      setPages([[]]);
      setTitle('');
      setHeader('Reviewbox');
      setId('publishing-draft:' + uid());
      setSelected('');
      setError('');
      origin.current = ns;
    }
  }, [ns]);
  const measure = useCallback(() => {
    const root = flow.current;
    if (!root) return;
    const bounds = root.getBoundingClientRect(),
      left = bounds.left,
      stride = (STEP * bounds.width) / A4.contentWidth;
    let maxPage = 0;
    const starts = new Map<string, number>();
    for (const child of Array.from(root.children)) {
      const range = document.createRange();
      range.selectNodeContents(child);
      const rects = Array.from(range.getClientRects()).filter(
        (r) => r.width > 0 && r.height > 0,
      );
      for (const rect of rects)
        maxPage = Math.max(
          maxPage,
          Math.max(0, Math.floor((rect.left - left + 2) / stride)),
        );
      const first = rects[0];
      if (first && child instanceof HTMLElement && child.dataset.questionId)
        starts.set(
          child.dataset.questionId,
          Math.max(0, Math.floor((first.left - left + 2) / stride)),
        );
    }
    const next = Array.from({ length: maxPage + 1 }, () => [] as string[]);
    for (const q of questions) {
      const p = starts.get(q.id) ?? 0;
      while (next.length <= p) next.push([]);
      next[p].push(q.id);
    }
    setPages((prev) =>
      JSON.stringify(prev) === JSON.stringify(next) ? prev : next,
    );
  }, [questions.map((q) => q.id + ':' + q.version).join('|')]);
  useEffect(() => {
    let live = true;
    const frame = requestAnimationFrame(measure),
      observer = new ResizeObserver(measure);
    if (flow.current) {
      observer.observe(flow.current);
      for (const child of Array.from(flow.current.children))
        observer.observe(child);
    }
    void document.fonts.ready.then(() => {
      if (live) measure();
    });
    return () => {
      live = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [measure, title, styles, images, minutes, zoom]);
  function toggle(q: Question) {
    setIds((previous) =>
      previous.includes(q.id)
        ? previous.filter((id) => id !== q.id)
        : previous.length < 100
          ? [...previous, q.id]
          : previous,
    );
    if (!selected) setSelected(q.id);
  }
  function style(patch: Partial<QuestionPageStyle>) {
    if (!active) return;
    setStyles((s) => ({
      ...s,
      [active.id]: { ...DEFAULT_STYLE, ...s[active.id], ...patch },
    }));
  }
  async function prepare() {
    setBusy(true);
    setError('');
    const abort = new AbortController();
    controller.current = abort;
    const next = { ...images },
      marks = { ...signatures };
    try {
      const { captureQuestionVisuals } = await import('@/lib/export-visuals');
      for (const [i, q] of questions.entries()) {
        if (currentNamespace() !== ns || abort.signal.aborted)
          throw Error('操作已取消或账户已切换');
        setStatus('准备题图 ' + (i + 1) + ' / ' + questions.length);
        if (marks[q.id] === signature(q)) continue;
        next[q.id] = await captureQuestionVisuals(q, 'question', abort.signal);
        marks[q.id] = signature(q);
      }
      if (currentNamespace() !== ns || abort.signal.aborted) return;
      setImages(next);
      setSignatures(marks);
      setStatus('题图准备完成');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setError('');
    try {
      if (currentNamespace() !== ns) throw Error('账户已切换');
      await put(
        'job',
        {
          id,
          kind: 'exam-publishing-draft',
          title,
          header,
          numbers,
          minutes,
          ids,
          styles,
        },
        id,
        false,
        ns,
      );
      await refresh();
      notify('试卷排版已保存');
      setStatus('排版已保存，图片在重新打开时按题目重新加载');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function exportWord() {
    setBusy(true);
    setError('');
    try {
      trackProductEvent('export_started', 'subjects');
      if (missing.length) throw Error('请先准备题图，检查A4预览后再导出');
      const { exportBooklet } = await import('@/lib/export-docx');
      const publishing: PublishingLayout = {
        header,
        showPageNumbers: numbers,
        pageQuestionIds: pages,
        questions: Object.fromEntries(
          questions.map((q) => [q.id, { ...DEFAULT_STYLE, ...styles[q.id] }]),
        ),
      };
      const blob = await exportBooklet(questions, {
        title: title || '试卷',
        kind: 'exam',
        answerLines: 3,
        groupBy: 'none',
        images,
        examMinutes: minutes,
        publishing,
      });
      if (currentNamespace() !== ns) throw Error('账户已切换，已取消下载');
      download.prepare(
        blob,
        (title.replace(/[\\/:*?"<>|]/g, '').slice(0, 100) || '试卷') + '.docx',
      );
      setStatus('文档已生成，请点击下载 Word 文档保存。');
      trackProductEvent('export_ready', 'subjects');
    } catch (e) {
      trackProductEvent('export_error', 'subjects');
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const currentStyle = { ...DEFAULT_STYLE, ...styles[selected] };
  return (
    <section className="studio-page publishing-studio">
      <header className="studio-heading">
        <div>
          <button
            className="text-button"
            onClick={() => navigate('subjects', subject, 'materials')}
          >
            ← 返回资料库
          </button>
          <h1>试卷排版工作台</h1>
          <p>
            A4 真实分页预览 · 共 {questions.length} 题 / {pages.length} 页
          </p>
        </div>
        <div className="studio-tools">
          <button
            className="secondary"
            disabled={busy}
            onClick={() => void save()}
          >
            保存排版
          </button>
          <button
            className="secondary"
            disabled={busy || !missing.length}
            onClick={() => void prepare()}
          >
            准备题图{missing.length ? ' · ' + missing.length : ''}
          </button>
          <button
            className="primary"
            disabled={
              busy ||
              !questions.length ||
              !!missing.length ||
              questions.length !== ids.length
            }
            onClick={() => void exportWord()}
          >
            导出 Word
          </button>
        </div>
      </header>
      <PreparedDownload file={download.file} />
      {status && (
        <p role="status" className="studio-note">
          {status}
        </p>
      )}
      {error && (
        <p role="alert" className="studio-error">
          {error}
        </p>
      )}
      {missing.length > 0 && (
        <p className="studio-note">
          有 {missing.length}{' '}
          道题的插图待准备。完成后，预览和导出使用同一份实际题图。
        </p>
      )}
      {questions.length !== ids.length && (
        <p role="alert">有题目已从题库移除，请重新选择后保存。</p>
      )}
      <div className="publishing-layout">
        <aside className="publishing-controls">
          <label>
            打开已保存排版
            <select
              value=""
              disabled={busy}
              onChange={(e) => {
                const d = drafts.find((d) => d.id === e.target.value);
                if (!d) return;
                setId(d.id);
                setTitle(d.title);
                setHeader(d.header);
                setNumbers(d.numbers);
                setMinutes(d.minutes);
                setIds(d.ids);
                setStyles(d.styles);
                setImages({});
                setSignatures({});
                setError('');
              }}
            >
              <option value="">选择排版</option>
              {drafts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title || '未命名试卷'}
                </option>
              ))}
            </select>
          </label>
          <label>
            试卷名称
            <input
              value={title}
              maxLength={100}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <div className="studio-field-grid">
            <label>
              页眉
              <input
                value={header}
                maxLength={100}
                onChange={(e) => setHeader(e.target.value)}
              />
            </label>
            <label>
              考试时长
              <input
                type="number"
                min={1}
                max={480}
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
              />
            </label>
          </div>
          <label className="studio-inline">
            <input
              type="checkbox"
              checked={numbers}
              onChange={(e) => setNumbers(e.target.checked)}
            />
            显示页码
          </label>
          <label>
            预览比例
            <select
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
            >
              {[50, 65, 85, 100].map((v) => (
                <option value={v} key={v}>
                  {v}%
                </option>
              ))}
            </select>
          </label>
          <details open>
            <summary>选择题目</summary>
            <select
              aria-label="试卷题目范围"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
            >
              <option value="all">当前学科全部题目</option>
              {data.packs
                .filter(
                  (p) => p.id !== 'review-core' && p.id !== 'review-framework',
                )
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
            </select>
            <input
              type="search"
              aria-label="搜索试卷题目"
              placeholder="搜索题干"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="publishing-question-picker">
              {catalog.map((q) => (
                <label key={q.id}>
                  <input
                    type="checkbox"
                    checked={ids.includes(q.id)}
                    disabled={!ids.includes(q.id) && ids.length >= 100}
                    onChange={() => toggle(q)}
                  />
                  <span>{q.prompt}</span>
                </label>
              ))}
            </div>
          </details>
          <details open>
            <summary>题目顺序 · 可拖动</summary>
            <ol className="publishing-order">
              {questions.map((q, i) => (
                <li
                  key={q.id}
                  draggable
                  onDragStart={(e) =>
                    e.dataTransfer.setData('text/plain', q.id)
                  }
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const from = ids.indexOf(
                      e.dataTransfer.getData('text/plain'),
                    );
                    if (from >= 0) setIds(moveItem(ids, from, i));
                  }}
                >
                  <button
                    aria-current={selected === q.id ? 'page' : undefined}
                    onClick={() => setSelected(q.id)}
                  >
                    {i + 1}. {q.prompt}
                  </button>
                  <button
                    aria-label={'第' + (i + 1) + '题上移'}
                    disabled={!i}
                    onClick={() => setIds(moveItem(ids, i, i - 1))}
                  >
                    ↑
                  </button>
                  <button
                    aria-label={'第' + (i + 1) + '题下移'}
                    disabled={i === ids.length - 1}
                    onClick={() => setIds(moveItem(ids, i, i + 1))}
                  >
                    ↓
                  </button>
                  <button
                    aria-label={'移除第' + (i + 1) + '题'}
                    onClick={() => setIds(ids.filter((id) => id !== q.id))}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ol>
          </details>
          {active && (
            <fieldset>
              <legend>第 {ids.indexOf(active.id) + 1} 题排版</legend>
              <label>
                插图宽度 {currentStyle.imageWidth}%
                <input
                  type="range"
                  min={25}
                  max={100}
                  value={currentStyle.imageWidth}
                  onChange={(e) =>
                    style({ imageWidth: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                答题留白（行）
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={currentStyle.answerLines}
                  onChange={(e) =>
                    style({
                      answerLines: Math.max(
                        0,
                        Math.min(30, Number(e.target.value)),
                      ),
                    })
                  }
                />
              </label>
              <label className="studio-inline">
                <input
                  type="checkbox"
                  checked={currentStyle.breakBefore}
                  onChange={(e) => style({ breakBefore: e.target.checked })}
                />
                本题另起一页
              </label>
            </fieldset>
          )}
          <p className="studio-note">
            分页由浏览器按实际内容排版，长题可跨页。Word
            会使用相同顺序、分页起点、图宽、页眉和留白；字体差异仍可能造成少量换页差异。
          </p>
        </aside>
        <div className="publishing-canvas" aria-label="A4试卷分页预览">
          <div
            style={{
              width: (pages.length * STEP * zoom) / 100,
              height: (A4.height * zoom) / 100,
            }}
          >
            <div
              className="publishing-paper-strip"
              style={{
                width: pages.length * STEP,
                transform: `scale(${zoom / 100})`,
                transformOrigin: 'top left',
              }}
            >
              {pages.map((_, i) => (
                <div
                  className="publishing-sheet"
                  key={i}
                  style={{ left: i * STEP }}
                >
                  <header>{header}</header>
                  <footer>{numbers ? i + 1 : ''}</footer>
                </div>
              ))}
              <div className="publishing-flow" ref={flow}>
                <div className="publishing-title">
                  <h2>{title || '未命名试卷'}</h2>
                  <p>试卷 · {questions.length} 题</p>
                  <p>姓名 ____________　班级 ____________　日期 ____________</p>
                  <p>
                    考试时间：{minutes} 分钟　总分：
                    {questions.reduce(
                      (sum, q) => sum + publicationPoints(q),
                      0,
                    )}{' '}
                    分
                  </p>
                </div>
                {questions.map((q, i) => {
                  const style = { ...DEFAULT_STYLE, ...styles[q.id] };
                  return (
                    <article
                      data-question-id={q.id}
                      key={q.id}
                      className={
                        'publishing-question' +
                        (style.breakBefore ? ' page-break' : '') +
                        (selected === q.id ? ' selected' : '')
                      }
                      onClick={() => setSelected(q.id)}
                    >
                      {q.passage && (
                        <div className="publishing-passage">
                          <MathText>{q.passage}</MathText>
                        </div>
                      )}
                      <p className="publishing-question-title">
                        <b>{i + 1}.</b> <MathText>{q.prompt}</MathText>
                      </p>
                      {(images[q.id] ?? []).map((image, j) => (
                        <figure key={j}>
                          <PaperImage
                            image={image}
                            width={style.imageWidth}
                            onLoad={measure}
                          />
                        </figure>
                      ))}
                      {q.diagram?.type === 'semantic' &&
                        q.diagram.kind === 'bioasset' &&
                        (images[q.id] ?? []).length > 0 && (
                          <small className="publishing-credit">
                            {bioAssetCredit(q.diagram.assetId)}
                          </small>
                        )}
                      {q.options?.map((o, j) => (
                        <p className="publishing-option" key={j}>
                          {String.fromCharCode(65 + j)}.{' '}
                          <MathText>{o}</MathText>
                        </p>
                      ))}
                      {q.matching && (
                        <table>
                          <tbody>
                            {q.matching.left.map((l, j) => (
                              <tr key={l.id}>
                                <td>
                                  {j + 1}. {l.text}
                                </td>
                                <td>
                                  {String.fromCharCode(65 + j)}.{' '}
                                  {q.matching!.right[j]?.text}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                      {Array.from({ length: style.answerLines }, (_, j) => (
                        <div key={j} className="publishing-answer-line" />
                      ))}
                    </article>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
