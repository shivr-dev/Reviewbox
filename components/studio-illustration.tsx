'use client';
import { useState } from 'react';
import type { Question } from '@/lib/model';
import { semanticDiagramSchema } from '@/lib/diagram-spec';
import ScientificAuthoring from './scientific-authoring';
export default function StudioIllustration({
  question: q,
  change,
}: {
  question: Question;
  change: (patch: Partial<Question>) => void;
}) {
  const [mode, setMode] = useState(''),
    [expression, setExpression] = useState(''),
    [points, setPoints] = useState([
      { id: 'A', x: 0, y: 0 },
      { id: 'B', x: 4, y: 0 },
      { id: 'C', x: 2, y: 3 },
    ]),
    [range, setRange] = useState([-5, 5, -5, 5]),
    [error, setError] = useState('');
  function draw(value: unknown) {
    const parsed = semanticDiagramSchema.safeParse(value);
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join('；'));
      return;
    }
    change({ diagram: parsed.data, diagramChoice: undefined });
    setError('');
  }
  async function image(file?: File) {
    if (!file) return;
    setError('');
    try {
      if (
        !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
        file.size > 700000
      )
        throw Error('请选择700KB以内的PNG、JPEG或WebP图片');
      const src = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(Error('图片读取失败'));
        reader.readAsDataURL(file);
      });
      change({
        media: [
          ...(q.media ?? []),
          { id: crypto.randomUUID(), src, alt: file.name, purpose: 'question' },
        ],
        diagramChoice: 'original',
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="studio-illustration">
      <ScientificAuthoring
        initial={q.diagram?.type === 'semantic' ? q.diagram : undefined}
        onChoose={(diagram) => change({ diagram, diagramChoice: undefined })}
      />
      <div className="studio-tools">
        <button
          type="button"
          className="secondary"
          onClick={() => {
            if (
              q.diagram?.type === 'semantic' &&
              q.diagram.kind === 'function'
            ) {
              setExpression(q.diagram.functions[0]?.expression ?? '');
              setRange([...q.diagram.xRange, ...q.diagram.yRange]);
            }
            setMode(mode === 'function' ? '' : 'function');
          }}
        >
          函数图
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            if (q.diagram?.type === 'semantic' && q.diagram.kind === 'geometry')
              setPoints(
                q.diagram.points.map((p) => ({ id: p.id, x: p.x, y: p.y })),
              );
            setMode(mode === 'geometry' ? '' : 'geometry');
          }}
        >
          几何图
        </button>
        <label className="studio-file-button">
          上传原图
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => void image(e.target.files?.[0])}
          />
        </label>
        {q.diagram && (
          <button
            type="button"
            className="text-button"
            onClick={() =>
              change({ diagram: undefined, diagramChoice: undefined })
            }
          >
            移除结构图
          </button>
        )}
      </div>
      {mode === 'function' && (
        <fieldset>
          <legend>函数条件</legend>
          <label>
            表达式
            <input
              value={expression}
              placeholder="如 x^2 或 sin(x)"
              onChange={(e) => setExpression(e.target.value)}
            />
          </label>
          <div className="studio-field-grid">
            {['x 最小', 'x 最大', 'y 最小', 'y 最大'].map((label, i) => (
              <label key={label}>
                {label}
                <input
                  type="number"
                  value={range[i]}
                  onChange={(e) =>
                    setRange((r) =>
                      r.map((v, j) => (i === j ? Number(e.target.value) : v)),
                    )
                  }
                />
              </label>
            ))}
          </div>
          <button
            type="button"
            className="secondary"
            onClick={() =>
              draw({
                type: 'semantic',
                kind: 'function',
                mode: 'quantitative',
                xRange: range.slice(0, 2),
                yRange: range.slice(2, 4),
                functions: [{ expression, label: 'y = ' + expression }],
              })
            }
          >
            应用函数图
          </button>
        </fieldset>
      )}
      {mode === 'geometry' && (
        <fieldset>
          <legend>按顺序连接顶点，构成封闭图形</legend>
          {points.map((p, i) => (
            <div className="studio-field-grid" key={i}>
              <label>
                点名
                <input
                  value={p.id}
                  onChange={(e) =>
                    setPoints((ps) =>
                      ps.map((v, j) =>
                        i === j ? { ...v, id: e.target.value } : v,
                      ),
                    )
                  }
                />
              </label>
              {(['x', 'y'] as const).map((axis) => (
                <label key={axis}>
                  {axis}
                  <input
                    type="number"
                    value={p[axis]}
                    onChange={(e) =>
                      setPoints((ps) =>
                        ps.map((v, j) =>
                          i === j
                            ? { ...v, [axis]: Number(e.target.value) }
                            : v,
                        ),
                      )
                    }
                  />
                </label>
              ))}
              <button
                type="button"
                disabled={points.length <= 2}
                onClick={() => setPoints((ps) => ps.filter((_, j) => i !== j))}
              >
                移除点
              </button>
            </div>
          ))}
          <div className="studio-tools">
            <button
              type="button"
              className="secondary"
              disabled={points.length >= 12}
              onClick={() =>
                setPoints((ps) => [
                  ...ps,
                  { id: String.fromCharCode(65 + ps.length), x: 0, y: 0 },
                ])
              }
            >
              添加顶点
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() =>
                draw({
                  type: 'semantic',
                  kind: 'geometry',
                  mode: 'quantitative',
                  points,
                  segments: points.map((p, i) => [
                    p.id,
                    points[(i + 1) % points.length].id,
                  ]),
                })
              }
            >
              应用几何图
            </button>
          </div>
        </fieldset>
      )}
      {q.media?.map((m) => (
        <div className="studio-media-row" key={m.id}>
          <img src={m.src} alt={m.alt} />
          <input
            aria-label="图片说明"
            value={m.alt}
            onChange={(e) =>
              change({
                media: q.media!.map((x) =>
                  x.id === m.id ? { ...x, alt: e.target.value } : x,
                ),
              })
            }
          />
          <select
            aria-label="图片显示阶段"
            value={m.purpose ?? 'question'}
            onChange={(e) =>
              change({
                media: q.media!.map((x) =>
                  x.id === m.id
                    ? {
                        ...x,
                        purpose: e.target.value as 'question' | 'solution',
                      }
                    : x,
                ),
              })
            }
          >
            <option value="question">题目</option>
            <option value="solution">解析</option>
          </select>
          <button
            type="button"
            onClick={() =>
              change({ media: q.media!.filter((x) => x.id !== m.id) })
            }
          >
            移除
          </button>
        </div>
      ))}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
