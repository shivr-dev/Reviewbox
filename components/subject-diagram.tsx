'use client';
import { useId, useRef } from 'react';
import type { ReactNode } from 'react';
import {
  semanticDiagramSchema,
  type SemanticDiagram,
} from '@/lib/diagram-spec';
import { evaluateExpression } from '@/lib/diagram-expression';

const W = 560,
  H = 330;
const rad = (a: number) => (a * Math.PI) / 180;
type P = { x: number; y: number };
function fit(points: P[], padding = 58) {
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y),
    minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const scale = Math.min(
    (W - padding * 2) / Math.max(maxX - minX, 1),
    (H - padding * 2) / Math.max(maxY - minY, 1),
  );
  return (p: P) => ({
    x: W / 2 + (p.x - (maxX + minX) / 2) * scale,
    y: H / 2 - (p.y - (maxY + minY) / 2) * scale,
  });
}
/** Label bounding boxes are reserved before rendering, with deterministic alternative positions. */
export function placeDiagramLabels(
  items: { x: number; y: number; text: string }[],
) {
  const boxes: { x: number; y: number; w: number; h: number }[] = [];
  return items.map((item) => {
    const w = Math.min(
        160,
        Array.from(item.text).reduce(
          (n, c) => n + (/[\u3400-\u9fff]/.test(c) ? 14 : 8),
          0,
        ),
      ),
      h = 18;
    let selected = { x: 20, y: 20, w, h };
    for (let ring = 0; ring < 6; ring++) {
      let found = false;
      for (const [dx, dy] of [
        [10, -14],
        [10, 24],
        [-w - 10, -14],
        [-w - 10, 24],
        [14, -36],
        [-w - 14, 44],
      ]) {
        const box = {
          x: Math.max(8, Math.min(W - w - 8, item.x + dx)),
          y: Math.max(18, Math.min(H - 8, item.y + dy + ring * 17)),
          w,
          h,
        };
        if (
          !boxes.some(
            (b) =>
              box.x < b.x + b.w + 6 &&
              box.x + w + 6 > b.x &&
              box.y - h < b.y + 6 &&
              box.y + 6 > b.y - b.h,
          )
        ) {
          selected = box;
          found = true;
          break;
        }
      }
      if (found) break;
    }
    boxes.push(selected);
    return { ...item, x: selected.x, y: selected.y };
  });
}
function Labels({
  items,
}: {
  items: { x: number; y: number; text: string }[];
}) {
  return (
    <g fill="#20252b" stroke="none" fontSize="14">
      {placeDiagramLabels(items).map((p, i) => (
        <text key={i} x={p.x} y={p.y}>
          {p.text}
        </text>
      ))}
    </g>
  );
}
export function SemanticDrawing({
  spec,
  id,
}: {
  spec: SemanticDiagram;
  id: string;
}) {
  const arrow = `url(#arrow-${id})`,
    parts: ReactNode[] = [];
  if (spec.kind === 'geometry') {
    const all = [...spec.points];
    for (const c of spec.circles ?? []) {
      const center = spec.points.find((p) => p.id === c.center)!;
      all.push(
        { id: 'bounds', x: center.x + c.r, y: center.y + c.r },
        { id: 'bounds', x: center.x - c.r, y: center.y - c.r },
      );
    }
    const project = fit(all),
      p = new Map(spec.points.map((p) => [p.id, project(p)]));
    for (const [i, [a, b]] of spec.segments.entries())
      parts.push(
        <line
          key={'l' + i}
          x1={p.get(a)!.x}
          y1={p.get(a)!.y}
          x2={p.get(b)!.x}
          y2={p.get(b)!.y}
        />,
      );
    for (const c of spec.circles ?? []) {
      const a = p.get(c.center)!,
        src = spec.points.find((p) => p.id === c.center)!,
        b = project({ x: src.x + c.r, y: src.y });
      parts.push(
        <circle
          key={c.id}
          cx={a.x}
          cy={a.y}
          r={Math.abs(b.x - a.x)}
          fill="none"
        />,
      );
    }
    for (const [i, m] of (spec.marks ?? []).entries()) {
      const ps = m.points.map((x) => p.get(x)!);
      if (m.kind === 'right') {
        const [a, b, c] = ps,
          la = Math.hypot(a.x - b.x, a.y - b.y),
          lc = Math.hypot(c.x - b.x, c.y - b.y),
          u = { x: ((a.x - b.x) / la) * 12, y: ((a.y - b.y) / la) * 12 },
          v = { x: ((c.x - b.x) / lc) * 12, y: ((c.y - b.y) / lc) * 12 };
        parts.push(
          <path
            key={'m' + i}
            d={`M${b.x + u.x},${b.y + u.y} l${v.x},${v.y} l${-u.x},${-u.y}`}
            fill="none"
          />,
        );
      }
      if (m.kind === 'parallel' || m.kind === 'equal')
        for (let j = 0; j < 2; j++) {
          const a = ps[j * 2],
            b = ps[j * 2 + 1],
            cx = (a.x + b.x) / 2,
            cy = (a.y + b.y) / 2,
            angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
          parts.push(
            <g
              key={'m' + i + j}
              transform={`translate(${cx} ${cy}) rotate(${angle})`}
            >
              {m.kind === 'equal' ? (
                <path d="M0 -6 V6" />
              ) : (
                <path d="M-5 -5 L1 0 L-5 5 M1 -5 L7 0 L1 5" fill="none" />
              )}
            </g>,
          );
        }
      if (m.kind === 'angle') {
        const [a, b, c] = ps,
          a1 = Math.atan2(a.y - b.y, a.x - b.x),
          a2 = Math.atan2(c.y - b.y, c.x - b.x),
          delta = ((a2 - a1 + Math.PI * 3) % (Math.PI * 2)) - Math.PI,
          r = 23;
        parts.push(
          <path
            key={'m' + i}
            d={`M${b.x + r * Math.cos(a1)},${b.y + r * Math.sin(a1)} A${r},${r} 0 0 ${delta > 0 ? 1 : 0} ${b.x + r * Math.cos(a2)},${b.y + r * Math.sin(a2)}`}
            fill="none"
          />,
        );
      }
      if (m.kind === 'dimension') {
        const [a, b] = ps;
        parts.push(
          <g key={'m' + i}>
            <path
              d={`M${a.x} ${a.y + 22} L${b.x} ${b.y + 22}`}
              markerStart={arrow}
              markerEnd={arrow}
            />
            <text
              x={(a.x + b.x) / 2}
              y={(a.y + b.y) / 2 + 42}
              textAnchor="middle"
              stroke="none"
              fill="#20252b"
            >
              {m.label}
            </text>
          </g>,
        );
      }
    }
    parts.push(
      <g key="points" fill="#20252b">
        {spec.points.map((pt) => {
          const a = p.get(pt.id)!;
          return <circle key={pt.id} cx={a.x} cy={a.y} r="2.5" />;
        })}
      </g>,
      <Labels
        key="labels"
        items={spec.points.map((pt) => ({
          ...p.get(pt.id)!,
          text: pt.label ?? pt.id,
        }))}
      />,
    );
    for (const [i, m] of (spec.marks ?? []).entries())
      if (m.label && m.kind === 'angle') {
        const a = p.get(m.points[1])!;
        parts.push(
          <text
            key={'angle-label' + i}
            x={a.x + 28}
            y={a.y - 18}
            stroke="none"
            fill="#20252b"
          >
            {m.label}
          </text>,
        );
      }
  }
  if (spec.kind === 'function') {
    const [xmin, xmax] = spec.xRange,
      [ymin, ymax] = spec.yRange,
      px = (x: number) => 55 + ((x - xmin) / (xmax - xmin)) * 450,
      py = (y: number) => 285 - ((y - ymin) / (ymax - ymin)) * 250;
    const x0 = Math.max(55, Math.min(505, px(0))),
      y0 = Math.max(35, Math.min(285, py(0))),
      nice = (d: number) => {
        const p = 10 ** Math.floor(Math.log10(d / 8)),
          m = d / 8 / p;
        return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
      },
      tx = spec.tickX ?? nice(xmax - xmin),
      ty = spec.tickY ?? nice(ymax - ymin);
    for (
      let x = Math.ceil(xmin / tx) * tx, i = 0;
      x <= xmax && i++ < 40;
      x += tx
    )
      parts.push(
        <g key={'x' + i}>
          {spec.grid && (
            <line
              x1={px(x)}
              y1="35"
              x2={px(x)}
              y2="285"
              stroke="#dce1e5"
              strokeWidth=".6"
            />
          )}
          <path d={`M${px(x)} ${y0}v5`} />
          {Math.abs(x) > 1e-7 && (
            <text
              x={px(x)}
              y={y0 + 20}
              textAnchor="middle"
              stroke="none"
              fill="#20252b"
              fontSize="12"
            >
              {+x.toPrecision(5)}
            </text>
          )}
        </g>,
      );
    for (
      let y = Math.ceil(ymin / ty) * ty, i = 0;
      y <= ymax && i++ < 40;
      y += ty
    )
      parts.push(
        <g key={'y' + i}>
          {spec.grid && (
            <line
              x1="55"
              y1={py(y)}
              x2="505"
              y2={py(y)}
              stroke="#dce1e5"
              strokeWidth=".6"
            />
          )}
          <path d={`M${x0} ${py(y)}h-5`} />
          {Math.abs(y) > 1e-7 && (
            <text
              x={x0 - 10}
              y={py(y) + 4}
              textAnchor="end"
              stroke="none"
              fill="#20252b"
              fontSize="12"
            >
              {+y.toPrecision(5)}
            </text>
          )}
        </g>,
      );
    parts.push(
      <g key="axes">
        <path d={`M55 ${y0}H517 M${x0} 285V23`} markerEnd={arrow} />
        <text x="528" y={y0 + 4} stroke="none" fill="#20252b">
          x
        </text>
        <text x={x0 + 10} y="22" stroke="none" fill="#20252b">
          y
        </text>
      </g>,
    );
    parts.push(
      <defs key="clip">
        <clipPath id={'plot-' + id}>
          <rect x="55" y="35" width="450" height="250" />
        </clipPath>
      </defs>,
    );
    spec.functions.forEach((f, i) => {
      let d = '',
        last: number | undefined;
      for (let k = 0; k <= 700; k++) {
        const x = xmin + ((xmax - xmin) * k) / 700,
          y = evaluateExpression(f.expression, x);
        if (!Number.isFinite(y) || y < ymin || y > ymax) {
          last = undefined;
          continue;
        }
        const yy = py(y);
        d +=
          (last === undefined || Math.abs(yy - last) > 100 ? 'M' : 'L') +
          px(x).toFixed(2) +
          ',' +
          yy.toFixed(2) +
          ' ';
        last = yy;
      }
      parts.push(
        <path
          key={'f' + i}
          d={d}
          fill="none"
          strokeDasharray={i ? '7 4' : undefined}
          strokeWidth="2"
          clipPath={`url(#plot-${id})`}
        />,
      );
    });
    parts.push(
      <Labels
        key="labels"
        items={(spec.keyPoints ?? []).map((p) => ({
          x: px(p.x),
          y: py(p.y),
          text: p.label ?? p.id,
        }))}
      />,
    );
  }
  if (spec.kind === 'forces') {
    const tilt = spec.surface === 'incline' ? (spec.incline ?? 0) : 0,
      origin = { x: 260, y: 163 },
      contact = {
        x: 260 + 42 * Math.sin(rad(tilt)),
        y: 163 + 42 * Math.cos(rad(tilt)),
      };
    parts.push(
      <g key="body" transform={`rotate(${-tilt} 260 163)`}>
        {spec.surface !== 'none' && (
          <>
            <path d="M100 205 H440" />
            <path
              d="M110 205l-10 10 M140 205l-10 10 M170 205l-10 10 M200 205l-10 10 M230 205l-10 10 M260 205l-10 10 M290 205l-10 10 M320 205l-10 10 M350 205l-10 10 M380 205l-10 10 M410 205l-10 10"
              strokeWidth="1"
            />
          </>
        )}
        {spec.body === 'box' ? (
          <rect x="212" y="121" width="96" height="84" rx="2" fill="#fff" />
        ) : (
          <circle cx="260" cy="163" r="42" fill="#fff" />
        )}
      </g>,
    );
    const labels = [];
    for (const f of spec.forces) {
      const p =
          f.origin === 'center'
            ? origin
            : f.origin === 'contact'
              ? contact
              : { x: 260, y: 121 },
        len = f.magnitude
          ? Math.max(
              42,
              Math.min(
                96,
                (f.magnitude /
                  Math.max(...spec.forces.map((f) => f.magnitude ?? 0))) *
                  96,
              ),
            )
          : 88,
        end = {
          x: p.x + len * Math.cos(rad(f.angle)),
          y: p.y - len * Math.sin(rad(f.angle)),
        };
      parts.push(
        <g key={f.id}>
          <line x1={p.x} y1={p.y} x2={end.x} y2={end.y} markerEnd={arrow} />
          <circle cx={p.x} cy={p.y} r="2.5" fill="#20252b" />
        </g>,
      );
      labels.push({ ...end, text: f.label });
    }
    parts.push(<Labels key="labels" items={labels} />);
  }
  if (spec.kind === 'optics') {
    const f = spec.focalLength,
      u = spec.objectDistance,
      h = spec.objectHeight,
      ff = spec.lens === 'convex' ? f : -f,
      v = Math.abs(1 / ff - 1 / u) < 1e-8 ? Infinity : 1 / (1 / ff - 1 / u),
      imageHeight = (-v / u) * h;
    const visibleV = spec.showImage && Number.isFinite(v) ? v : 0,
      left = Math.max(u, 2 * f, Math.max(0, -visibleV)) * 1.12,
      right = Math.max(2 * f, visibleV) * 1.12,
      upper =
        Math.max(h, spec.showImage && imageHeight > 0 ? imageHeight : 0) * 1.25,
      lower =
        Math.max(
          h * 0.6,
          spec.showImage && imageHeight < 0 ? -imageHeight : 0,
        ) * 1.25,
      scale = Math.min(460 / (left + right), 230 / (upper + lower)),
      cx = 55 + left * scale,
      cy = 40 + upper * scale,
      oh = h * scale,
      px = (x: number) => cx + x * scale,
      lensTop = Math.max(36, cy - Math.max(55, oh + 15)),
      lensBottom = Math.min(288, cy + Math.max(55, oh + 15));
    parts.push(
      <g key="axis">
        <path d={`M35 ${cy}H525`} strokeDasharray="7 5" />
        <path
          d={
            spec.lens === 'convex'
              ? `M${cx} ${lensTop} Q${cx + 27} ${cy} ${cx} ${lensBottom} Q${cx - 27} ${cy} ${cx} ${lensTop}Z`
              : `M${cx - 13} ${lensTop} Q${cx + 11} ${cy} ${cx - 13} ${lensBottom} H${cx + 13} Q${cx - 11} ${cy} ${cx + 13} ${lensTop}Z`
          }
          fill="#fff"
        />
        <line x1={px(-u)} y1={cy} x2={px(-u)} y2={cy - oh} markerEnd={arrow} />
      </g>,
    );
    for (const [i, x] of [-2 * f, -f, f, 2 * f].entries())
      parts.push(
        <g key={'focus' + i}>
          <path d={`M${px(x)} ${cy - 4}v8`} />
          <text
            x={px(x)}
            y={cy + 23}
            textAnchor="middle"
            fill="#20252b"
            stroke="none"
          >
            {Math.abs(x) === f ? 'F' : '2F'}
          </text>
        </g>,
      );
    const rayEnd = Math.min(
        right * 0.9,
        Math.max(f, visibleV > 0 ? visibleV : f * 1.4),
      ),
      rayY = cy - oh + (oh * rayEnd) / ff;
    if (spec.showRays)
      parts.push(
        <g key="rays" fill="none" strokeWidth="1.3">
          <path
            d={`M${px(-u)} ${cy - oh}H${cx} L${px(rayEnd)} ${rayY}`}
            markerEnd={arrow}
          />
          <path
            d={`M${px(-u)} ${cy - oh}L${px(rayEnd)} ${cy + (oh * rayEnd) / u}`}
            markerEnd={arrow}
          />
          {spec.showImage && v < 0 && (
            <>
              <path
                d={`M${cx} ${cy - oh}L${px(v)} ${cy - oh + (oh * v) / ff}`}
                strokeDasharray="5 4"
              />
              <path
                d={`M${cx} ${cy}L${px(v)} ${cy + (oh * v) / u}`}
                strokeDasharray="5 4"
              />
            </>
          )}
        </g>,
      );
    if (spec.showImage && Number.isFinite(v))
      parts.push(
        <line
          key="image"
          x1={px(v)}
          y1={cy}
          x2={px(v)}
          y2={cy - imageHeight * scale}
          markerEnd={arrow}
          strokeDasharray={v < 0 ? '5 4' : undefined}
        />,
      );
    parts.push(
      <Labels
        key="labels"
        items={[
          { x: px(-u), y: cy - oh, text: '物体' },
          {
            x: cx,
            y: lensTop,
            text: spec.lens === 'convex' ? '凸透镜' : '凹透镜',
          },
          ...(spec.showImage && Number.isFinite(v)
            ? [{ x: px(v), y: cy - imageHeight * scale, text: '像' }]
            : []),
        ]}
      />,
    );
  }
  if (spec.kind === 'experiment') {
    const items = spec.apparatus,
      evap = spec.setup === 'evaporation',
      filter = spec.setup === 'filtration';
    const positions: Record<string, P> = {
      evaporating_dish: { x: 280, y: 125 },
      glass_rod: {
        x: evap ? 302 : filter ? 243 : 280,
        y: evap ? 100 : filter ? 70 : 120,
      },
      alcohol_lamp: { x: 280, y: 225 },
      stand: { x: evap ? 280 : 155, y: evap ? 173 : 155 },
      funnel: { x: 280, y: 110 },
      filter_paper: { x: 280, y: 108 },
      beaker: { x: 280, y: 225 },
      test_tube: { x: 410, y: 175 },
      graduated_cylinder: { x: 420, y: 175 },
      delivery_tube: { x: 360, y: 125 },
    };
    for (const [i, a] of items.entries()) {
      const loc =
        spec.setup === 'apparatus'
          ? { x: 80 + (i % 5) * 100, y: 110 + Math.floor(i / 5) * 145 }
          : positions[a.kind];
      parts.push(
        <g key={a.id} transform={`translate(${loc.x} ${loc.y})`}>
          <Apparatus kind={a.kind} liquidLevel={a.liquidLevel} tripod={evap} />
        </g>,
      );
    }
    // Labels are equipment names only; operating principles belong in the solution.
    if (evap) {
      const anchors: Record<string, { x: number; y: number; labelY: number }> =
        {
          evaporating_dish: { x: 365, y: 125, labelY: 126 },
          glass_rod: { x: 333, y: 58, labelY: 54 },
          stand: { x: 347, y: 195, labelY: 198 },
          alcohol_lamp: { x: 314, y: 250, labelY: 253 },
        };
      parts.push(
        <g key="labels" strokeWidth=".9">
          {items
            .filter((a) => a.label)
            .map((a) => {
              const p = anchors[a.kind];
              if (!p) return null;
              return (
                <g key={a.id}>
                  <path d={`M${p.x} ${p.y}L400 ${p.labelY}H412`} />
                  <text x="420" y={p.labelY + 5} fill="#20252b" stroke="none">
                    {a.label}
                  </text>
                </g>
              );
            })}
        </g>,
      );
    } else
      parts.push(
        <Labels
          key="labels"
          items={items
            .filter((a) => a.label)
            .map((a) => {
              const i = items.indexOf(a),
                p =
                  spec.setup === 'apparatus'
                    ? {
                        x: 80 + (i % 5) * 100,
                        y: 110 + Math.floor(i / 5) * 145,
                      }
                    : positions[a.kind];
              return {
                x: p.x + (a.kind === 'glass_rod' ? 28 : 48),
                y: p.y,
                text: a.label!,
              };
            })}
        />,
      );
    for (const [i, c] of (spec.connections ?? []).entries())
      if (c.relation === 'tube') {
        const a = positions[items.find((a) => a.id === c.from)!.kind],
          b = positions[items.find((a) => a.id === c.to)!.kind];
        parts.push(
          <path
            key={'tube' + i}
            d={`M${a.x} ${a.y - 30}V${Math.min(a.y, b.y) - 70}H${b.x}V${b.y - 20}`}
            fill="none"
            strokeWidth="3"
          />,
        );
      }
  }
  if (spec.kind === 'circuit') {
    const project = fit(spec.nodes),
      p = new Map(spec.nodes.map((p) => [p.id, project(p)]));
    for (const c of spec.components) {
      const a = p.get(c.from)!,
        b = p.get(c.to)!,
        len = Math.hypot(b.x - a.x, b.y - a.y),
        angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
        mid = len / 2;
      parts.push(
        <g key={c.id} transform={`translate(${a.x} ${a.y}) rotate(${angle})`}>
          <path d={`M0 0H${Math.max(0, mid - 24)} M${mid + 24} 0H${len}`} />
          <g transform={`translate(${mid} 0)`}>
            {c.kind === 'wire' ? (
              <path d="M-24 0H24" />
            ) : c.kind === 'battery' ? (
              <>
                <path d="M-24 0H-6 M-6 -20V20 M6 -10V10 M6 0H24" />
                <text x="-15" y="-25" fill="#20252b" stroke="none">
                  +
                </text>
              </>
            ) : c.kind.startsWith('switch') ? (
              <>
                <circle cx="-20" cy="0" r="3" fill="#fff" />
                <circle cx="20" cy="0" r="3" fill="#fff" />
                <path
                  d={c.kind === 'switch_open' ? 'M-18 -2L15 -17' : 'M-17 0H17'}
                />
              </>
            ) : c.kind === 'resistor' ? (
              <rect x="-24" y="-10" width="48" height="20" fill="#fff" />
            ) : (
              <>
                <circle r="19" fill="#fff" />
                {c.kind === 'lamp' ? (
                  <path d="M-13 -13L13 13 M13 -13L-13 13" />
                ) : (
                  <text
                    textAnchor="middle"
                    y="5"
                    fill="#20252b"
                    stroke="none"
                    transform={`rotate(${-angle})`}
                  >
                    {c.kind === 'ammeter' ? 'A' : 'V'}
                  </text>
                )}
              </>
            )}
          </g>
        </g>,
      );
      if (c.label)
        parts.push(
          <text
            key={c.id + 'label'}
            x={(a.x + b.x) / 2}
            y={(a.y + b.y) / 2 - 28}
            textAnchor="middle"
            fill="#20252b"
            stroke="none"
          >
            {c.label}
          </text>,
        );
    }
    parts.push(
      <g key="junctions" fill="#20252b">
        {[...p.values()].map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3" />
        ))}
      </g>,
    );
  }
  if (spec.kind === 'statistics') {
    const min = Math.min(0, ...spec.data.map((d) => d.value)),
      max = Math.max(1, ...spec.data.map((d) => d.value)),
      py = (v: number) => 270 - ((v - min) / (max - min)) * 220,
      px = (i: number) => 75 + (i * 430) / Math.max(1, spec.data.length - 1);
    parts.push(<path key="axes" d={`M50 35V${py(0)}H525`} markerEnd={arrow} />);
    spec.data.forEach((d, i) =>
      parts.push(
        <g key={i}>
          {spec.chart === 'bar' ? (
            <rect
              x={px(i) - Math.min(20, 170 / spec.data.length)}
              y={Math.min(py(d.value), py(0))}
              width={Math.min(40, 340 / spec.data.length)}
              height={Math.abs(py(d.value) - py(0))}
              fill="#eee"
            />
          ) : spec.chart === 'numberline' ? (
            <path d={`M${px(i)} ${py(0) - 5}v10`} />
          ) : (
            <circle cx={px(i)} cy={py(d.value)} r="3" fill="#20252b" />
          )}
          <text
            x={px(i)}
            y="302"
            textAnchor="middle"
            fill="#20252b"
            stroke="none"
            fontSize="12"
          >
            {d.label}
          </text>
          <text
            x={px(i)}
            y={py(d.value) - 10}
            textAnchor="middle"
            fill="#20252b"
            stroke="none"
          >
            {d.value}
            {spec.unit}
          </text>
        </g>,
      ),
    );
    if (spec.chart === 'line')
      parts.push(
        <polyline
          key="line"
          points={spec.data.map((d, i) => `${px(i)},${py(d.value)}`).join(' ')}
          fill="none"
        />,
      );
  }
  if (spec.kind === 'lever') {
    const xs = [spec.pivot, ...spec.loads.map((l) => l.position)],
      lo = Math.min(...xs) - 1,
      hi = Math.max(...xs) + 1,
      px = (x: number) => 60 + ((x - lo) / (hi - lo)) * 440;
    parts.push(
      <g key="beam">
        <path d="M50 150H515" strokeWidth="4" />
        <path d={`M${px(spec.pivot)} 152l-16 30h32Z`} fill="#fff" />
      </g>,
    );
    spec.loads.forEach((l, i) =>
      parts.push(
        <g key={i}>
          <line
            x1={px(l.position)}
            y1="150"
            x2={px(l.position)}
            y2={150 + (l.force > 0 ? 85 : -85)}
            markerEnd={arrow}
          />
          <text
            x={px(l.position) + 10}
            y={150 + (l.force > 0 ? 92 : -90)}
            stroke="none"
            fill="#20252b"
          >
            {l.label}
          </text>
        </g>,
      ),
    );
  }
  if (spec.kind === 'buoyancy') {
    const y = 185 - (1 - spec.submerged) * 80;
    parts.push(
      <g key="vessel">
        <path d="M150 65V285H410V65" fill="none" />
        <path d="M151 185H409V284H151Z" fill="#f2f2f2" stroke="none" />
        <path d="M151 185H409" strokeDasharray="5 3" />
        <rect x="245" y={y} width="70" height="80" fill="#fff" />
        {spec.showForces && (
          <>
            <path d={`M280 ${y + 40}v-80`} markerEnd={arrow} />
            <path d={`M280 ${y + 40}v90`} markerEnd={arrow} />
          </>
        )}
      </g>,
      <Labels
        key="labels"
        items={[
          { x: 315, y: y + 30, text: spec.bodyLabel ?? '物体' },
          { x: 380, y: 235, text: spec.liquidLabel ?? '液体' },
        ]}
      />,
    );
  }
  if (spec.kind === 'motion') {
    const min = Math.min(...spec.positions.map((p) => p.x)),
      max = Math.max(...spec.positions.map((p) => p.x)),
      px = (x: number) => 60 + ((x - min) / Math.max(1, max - min)) * 440;
    parts.push(<path key="axis" d="M40 185H525" markerEnd={arrow} />);
    spec.positions.forEach((p, i) =>
      parts.push(
        <g key={i}>
          <circle cx={px(p.x)} cy="165" r="12" fill="#fff" />
          <path d={`M${px(p.x)} 181v8`} />
          <text
            x={px(p.x)}
            y="215"
            textAnchor="middle"
            fill="#20252b"
            stroke="none"
          >
            {p.label ?? `${p.time} s`}
          </text>
        </g>,
      ),
    );
    if (spec.direction)
      parts.push(
        <path
          key="direction"
          d={spec.direction === 'right' ? 'M220 105H340' : 'M340 105H220'}
          markerEnd={arrow}
        />,
      );
  }
  return (
    <>
      <defs>
        <marker
          id={'arrow-' + id}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path
            d="M1 1L9 5L1 9"
            fill="none"
            stroke="#20252b"
            strokeWidth="1.5"
          />
        </marker>
      </defs>
      <g
        stroke="#20252b"
        fill="none"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fontFamily="'Noto Sans SC',Arial,sans-serif"
        fontSize="14"
      >
        {parts}
      </g>
    </>
  );
}

function Apparatus({
  kind,
  liquidLevel,
  tripod,
}: {
  kind: string;
  liquidLevel?: number;
  tripod?: boolean;
}) {
  const liquid = liquidLevel !== undefined;
  switch (kind) {
    case 'evaporating_dish':
      return (
        <>
          <path d="M-88 -5 Q-76 43 0 48 Q76 43 88 -5" fill="#fff" />
          <ellipse rx="88" ry="16" cy="-5" fill="#fff" />
          {liquid && (
            <path
              d="M-72 0Q0 24 72 0Q55 23 0 26Q-55 23 -72 0Z"
              fill="#ededed"
            />
          )}
          <path d="M-88 -5Q0 26 88 -5" />
        </>
      );
    case 'glass_rod':
      return (
        <>
          <path d="M48 -61L-34 49" stroke="#fff" strokeWidth="7" />
          <path d="M46 -62L-36 48 M50 -59L-32 51" strokeWidth="1.5" />
          <path d="M46 -62Q48 -65 50 -59 M-36 48Q-36 53 -32 51" />
        </>
      );
    case 'beaker':
      return (
        <>
          <path d="M-42 -55H-28V49Q0 56 38 49V-55H45" fill="#fff" />
          {liquid && (
            <>
              <path
                d={`M-27 ${49 - 94 * liquidLevel!}H37V48Q0 54 -27 48Z`}
                fill="#ededed"
                stroke="none"
              />
              <path d={`M-27 ${49 - 94 * liquidLevel!}H37`} />
            </>
          )}
          {[-30, -10, 10, 30].map((y) => (
            <path key={y} d={`M24 ${y}H37`} strokeWidth="1" />
          ))}
        </>
      );
    case 'funnel':
      return (
        <>
          <path d="M-65 -50L-8 15V60H8V15L65 -50" fill="#fff" />
          <ellipse cy="-50" rx="65" ry="10" fill="#fff" />
        </>
      );
    case 'filter_paper':
      return (
        <path
          d="M-54 -44L0 9L54 -44 M-54 -44Q0 -28 54 -44"
          fill="none"
          strokeDasharray="4 3"
        />
      );
    case 'test_tube':
      return (
        <>
          <path d="M-17 -68V43A17 17 0 0 0 17 43V-68" fill="#fff" />
          <ellipse cy="-68" rx="18" ry="4" fill="#fff" />
          {liquid && (
            <path
              d={`M-16 ${43 - 100 * liquidLevel!}H16V43A16 16 0 0 1 -16 43Z`}
              fill="#ededed"
            />
          )}
        </>
      );
    case 'alcohol_lamp':
      return (
        <>
          <path
            d="M-31 14Q-42 32 -32 43H32Q42 32 31 14L13 0H-13Z"
            fill="#fff"
          />
          <path d="M-13 0V-10H13V0 M-4 -10V-22H4V-10" />
          <path
            d="M0 -22Q-15 -34 -3 -51Q-1 -38 4 -41Q18 -27 0 -22Z"
            fill="#fff"
          />
        </>
      );
    case 'stand':
      return tripod ? (
        <>
          <ellipse rx="76" ry="9" cy="5" />
          <path d="M-60 8L-78 84 M60 8L78 84 M0 12V84" />
        </>
      ) : (
        <>
          <path
            d="M-32 130H35 M0 130V-115 M0 -82H85 M77 -90V-74"
            strokeWidth="3"
          />
        </>
      );
    case 'delivery_tube':
      return (
        <path d="M-40 50V-35Q-40 -45 -30 -45H25Q35 -45 35 -35V30 M-34 50V-33Q-34 -39 -28 -39H23Q29 -39 29 -33V30" />
      );
    case 'graduated_cylinder':
      return (
        <>
          <path d="M-15 -76V65H15V-76 M-28 68H28L35 76H-35Z" fill="#fff" />
          <ellipse cy="-76" rx="16" ry="4" fill="#fff" />
          {Array.from({ length: 9 }, (_, i) => (
            <path
              key={i}
              d={`M${i % 2 ? 7 : 1} ${-60 + i * 13}H15`}
              strokeWidth="1"
            />
          ))}
          {liquid && (
            <path
              d={`M-14 ${65 - 130 * liquidLevel!}H14V64H-14Z`}
              fill="#ededed"
            />
          )}
        </>
      );
    default:
      return null;
  }
}
export default function SubjectDiagram({ spec }: { spec: SemanticDiagram }) {
  const id = useId().replace(/[^a-z0-9]/gi, ''),
    ref = useRef<SVGSVGElement>(null),
    parsed = semanticDiagramSchema.safeParse(spec);
  if (!parsed.success)
    return (
      <p className="diagram-error" role="status">
        图形条件需要确认，未显示不可靠的示意图。
      </p>
    );
  function exportSVG() {
    if (!ref.current) return;
    const url = URL.createObjectURL(
        new Blob([ref.current.outerHTML], { type: 'image/svg+xml' }),
      ),
      a = document.createElement('a');
    a.href = url;
    a.download = 'Reviewbox-' + spec.kind + '.svg';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const viewBox =
    spec.kind === 'experiment' && spec.setup === 'evaporation'
      ? '170 10 350 310'
      : spec.kind === 'forces'
        ? '110 30 340 280'
        : `0 0 ${W} ${H}`;
  return (
    <figure className="diagram professional-diagram">
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        viewBox={viewBox}
        role="img"
        aria-label={
          spec.caption ??
          {
            geometry: '几何图',
            function: '函数图像',
            forces: '受力分析图',
            optics: '透镜光路图',
            experiment: '实验装置图',
            circuit: '电路图',
            statistics: '统计图',
            lever: '杠杆图',
            buoyancy: '浮力示意图',
            motion: '运动示意图',
          }[spec.kind]
        }
      >
        <SemanticDrawing spec={parsed.data} id={id} />
      </svg>
      <figcaption>
        {spec.caption}
        <button type="button" className="diagram-export" onClick={exportSVG}>
          导出 SVG
        </button>
      </figcaption>
    </figure>
  );
}
