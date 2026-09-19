'use client';
import { useId } from 'react';
import type { Diagram as Spec } from '@/lib/model';
export function evaluateExpression(expression: string, x: number) {
  if (expression.length > 250) throw new Error('表达式过长');
  const tokens =
    expression.match(/(?:\d*\.)?\d+(?:e[+-]?\d+)?|x|[()+\-*/^]/gi) ?? [];
  if (tokens.join('') !== expression.replace(/\s/g, ''))
    throw new Error('不支持的表达式');
  let i = 0,
    steps = 0;
  function atom(): number {
    if (++steps > 500) throw new Error('表达式过于复杂');
    const t = tokens[i++];
    if (t === '(') {
      const y = sum();
      if (tokens[i++] !== ')') throw new Error('括号不匹配');
      return y;
    }
    if (t === 'x') return x;
    if (!t || !Number.isFinite(Number(t))) throw new Error('表达式不完整');
    return Number(t);
  }
  function power(): number {
    let y = atom();
    if (tokens[i] === '^') {
      i++;
      const p = unary();
      if (Math.abs(p) > 20) throw new Error('指数过大');
      y = Math.pow(y, p);
    }
    return y;
  }
  function unary(): number {
    if (tokens[i] === '-') {
      i++;
      return -unary();
    }
    if (tokens[i] === '+') {
      i++;
      return unary();
    }
    return power();
  }
  function mul(): number {
    let y = unary();
    while (tokens[i] === '*' || tokens[i] === '/') {
      const op = tokens[i++],
        b = unary();
      y = op === '*' ? y * b : y / b;
    }
    return y;
  }
  function sum(): number {
    let y = mul();
    while (tokens[i] === '+' || tokens[i] === '-') {
      const op = tokens[i++],
        b = mul();
      y = op === '+' ? y + b : y - b;
    }
    return y;
  }
  const y = sum();
  if (i !== tokens.length) throw new Error('表达式不正确');
  return y;
}
const num = (x: unknown, fallback = 0) =>
  typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= 10000
    ? x
    : fallback;
export default function Diagram({ spec }: { spec: Spec }) {
  const id = useId().replace(/:/g, '');
  try {
    const w = Math.max(200, Math.min(900, num(spec.canvas?.width, 600))),
      h = Math.max(150, Math.min(700, num(spec.canvas?.height, 340)));
    if (spec.type === 'function_graph') {
      const xr = spec.xRange ?? [-5, 5],
        yr = spec.yRange ?? [-10, 10];
      const [xmin, xmax] = xr.map((x) => num(x));
      const [ymin, ymax] = yr.map((x) => num(x));
      if (xmax <= xmin || ymax <= ymin)
        return <p className="muted">图形范围无效</p>;
      const px = (x: number) => 35 + ((x - xmin) / (xmax - xmin)) * (w - 60),
        py = (y: number) => h - 30 - ((y - ymin) / (ymax - ymin)) * (h - 60);
      const lines = [];
      for (let x = Math.ceil(xmin); x <= xmax && lines.length < 40; x++)
        lines.push(
          <g key={'x' + x}>
            <line x1={px(x)} y1={30} x2={px(x)} y2={h - 30} stroke="#e9ece6" />
            {x !== 0 && (
              <text
                x={px(x)}
                y={Math.min(h - 12, Math.max(15, py(0) + 18))}
                textAnchor="middle"
              >
                {x}
              </text>
            )}
          </g>,
        );
      for (let y = Math.ceil(ymin); y <= ymax && lines.length < 80; y++)
        lines.push(
          <g key={'y' + y}>
            <line x1={35} y1={py(y)} x2={w - 25} y2={py(y)} stroke="#e9ece6" />
            {y !== 0 && y % 2 === 0 && (
              <text
                x={Math.max(20, Math.min(w - 20, px(0) - 12))}
                y={py(y) + 4}
                textAnchor="end"
              >
                {y}
              </text>
            )}
          </g>,
        );
      return (
        <figure className="diagram">
          <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="函数图像">
            <defs>
              <clipPath id={'clip' + id}>
                <rect x="35" y="30" width={w - 60} height={h - 60} />
              </clipPath>
            </defs>
            {spec.showGrid !== false && lines}
            {spec.showAxes !== false && (
              <g stroke="#97a28f">
                <line x1={35} y1={py(0)} x2={w - 25} y2={py(0)} />
                <line x1={px(0)} y1={30} x2={px(0)} y2={h - 30} />
              </g>
            )}
            {(spec.functions ?? []).slice(0, 5).map((f, j) => {
              let d = '',
                drawing = false;
              for (let k = 0; k <= 300; k++) {
                const x = xmin + ((xmax - xmin) * k) / 300,
                  y = evaluateExpression(f.expression, x);
                if (!Number.isFinite(y) || y < ymin - 5 || y > ymax + 5) {
                  drawing = false;
                  continue;
                }
                d += `${drawing ? 'L' : 'M'}${px(x).toFixed(2)},${py(y).toFixed(2)} `;
                drawing = true;
              }
              return (
                <path
                  key={j}
                  d={d}
                  fill="none"
                  stroke={['#6774ad', '#5b8d79', '#aa7e55'][j % 3]}
                  strokeWidth="2.3"
                  clipPath={`url(#clip${id})`}
                />
              );
            })}
          </svg>
          <figcaption>
            {(spec.functions ?? []).map((f) => f.label).join(' · ')}
          </figcaption>
        </figure>
      );
    }
    const points = new Map(
      (spec.points ?? [])
        .slice(0, 100)
        .map((p) => [p.id, { x: num(p.x), y: num(p.y) }]),
    );
    return (
      <figure className="diagram">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          role="img"
          aria-label={spec.type === 'physics' ? '物理示意图' : '几何示意图'}
        >
          <defs>
            <marker
              id={'arrow' + id}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#627982" />
            </marker>
          </defs>
          {(spec.rects ?? []).slice(0, 40).map((r, i) => (
            <g key={'r' + i}>
              <rect
                x={num(r.x)}
                y={num(r.y)}
                width={Math.max(0, num(r.width))}
                height={Math.max(0, num(r.height))}
                fill={r.liquid ? '#dcecf0' : '#f0f2ed'}
                stroke="#7e9290"
              />
              {r.label && (
                <text x={num(r.x) + 10} y={num(r.y) + 20}>
                  {r.label}
                </text>
              )}
            </g>
          ))}
          {(spec.polygons ?? []).slice(0, 40).map((p, i) => (
            <polygon
              key={'p' + i}
              points={p.points
                .slice(0, 30)
                .map((x) => `${num(x[0])},${num(x[1])}`)
                .join(' ')}
              fill="#e5ece1"
              stroke="#6c8070"
            />
          ))}
          {(spec.circles ?? []).slice(0, 30).map((c, i) => (
            <g key={'c' + i}>
              <circle
                cx={num(c.x)}
                cy={num(c.y)}
                r={Math.max(1, num(c.r, 30))}
                fill="none"
                stroke="#6e8183"
              />
              {c.label && (
                <text x={num(c.x)} y={num(c.y)}>
                  {c.label}
                </text>
              )}
            </g>
          ))}
          {(spec.segments ?? []).slice(0, 120).map(([a, b], i) => {
            const A = points.get(a),
              B = points.get(b);
            return A && B ? (
              <line
                key={i}
                x1={A.x}
                y1={A.y}
                x2={B.x}
                y2={B.y}
                stroke="#687b79"
                strokeWidth="1.8"
              />
            ) : null;
          })}
          {(spec.arrows ?? []).slice(0, 50).map((a, i) => (
            <g key={'a' + i}>
              <line
                x1={num(a.x1)}
                y1={num(a.y1)}
                x2={num(a.x2)}
                y2={num(a.y2)}
                stroke="#627982"
                strokeWidth="2"
                markerEnd={`url(#arrow${id})`}
              />
              {a.label && (
                <text
                  x={(num(a.x1) + num(a.x2)) / 2 + 8}
                  y={(num(a.y1) + num(a.y2)) / 2 - 8}
                >
                  {a.label}
                </text>
              )}
            </g>
          ))}
          {(spec.angles ?? []).slice(0, 30).map((a, i) => {
            const start = (num(a.start) * Math.PI) / 180,
              end = (num(a.end) * Math.PI) / 180,
              r = Math.max(1, num(a.r, 20)),
              x = num(a.x),
              y = num(a.y);
            return (
              <path
                key={'angle' + i}
                d={`M${x + r * Math.cos(start)},${y + r * Math.sin(start)} A${r},${r} 0 0 1 ${x + r * Math.cos(end)},${y + r * Math.sin(end)}`}
                fill="none"
                stroke="#a38f63"
              />
            );
          })}
          {Array.from(points).map(([label, p]) => (
            <g key={label}>
              <circle cx={p.x} cy={p.y} r="2.5" fill="#61786b" />
              {spec.labels !== false && (
                <text x={p.x + 8} y={p.y - 8}>
                  {label}
                </text>
              )}
            </g>
          ))}
          {(spec.labelsText ?? []).slice(0, 60).map((l, i) => (
            <text key={'t' + i} x={num(l.x)} y={num(l.y)}>
              {l.text.slice(0, 100)}
            </text>
          ))}
        </svg>
        <figcaption>示意图由数据绘制，长度以题目条件为准。</figcaption>
      </figure>
    );
  } catch {
    return <p className="muted">图形描述未通过检查，请以题干条件为准。</p>;
  }
}
