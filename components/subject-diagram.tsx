'use client';
import {tr} from '@/lib/i18n';
import { useId, useRef, lazy, Suspense } from 'react';
import ScientificDiagram from './scientific-diagram';
import {ScientificDrawing} from './scientific-diagram';
const MathDiagram=lazy(()=>import('./math-diagram'));
const OpticsDiagram=lazy(()=>import('./optics-diagram'));
const ChemistryDiagram=lazy(()=>import('./chemistry-diagram'));
const MacromoleculeDiagram=lazy(()=>import('./macromolecule-diagram'));
const BioAssetDiagram=lazy(()=>import('./bioasset-diagram'));
const BiologyNetwork=lazy(()=>import('./biology-network'));
import {downloadDiagram} from '@/lib/math-svg';
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
  if(['measurement','wave','motion','forces','lever','buoyancy','statistics','biology'].includes(spec.kind)||spec.kind==='experiment'&&spec.setup==='inclined_cart')return <ScientificDrawing spec={spec} id={id}/>;
  const arrow = `url(#arrow-${id})`,
    parts: ReactNode[] = [];
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
            ) : c.kind === 'resistor'||c.kind==='variable_resistor' ? (
              <><rect x="-24" y="-10" width="48" height="20" fill="#fff"/>{c.kind==='variable_resistor'&&<path d="M-16 22L16 -22" markerEnd={arrow}/>}</>
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
      <p className="diagram-error" role="status">{tr("common:图形条件需要确认，未显示不可靠的示意图。")}</p>
    );
  if(spec.kind==='chemistry')return <Suspense fallback={<p role="status">{tr('common:题图加载中…')}</p>}><ChemistryDiagram spec={spec}/></Suspense>;
  if(spec.kind==='macromolecule')return <Suspense fallback={<p role="status">{tr('common:题图加载中…')}</p>}><MacromoleculeDiagram spec={spec}/></Suspense>;
  if(spec.kind==='bioasset')return <Suspense fallback={<p role="status">{tr('common:题图加载中…')}</p>}><BioAssetDiagram spec={spec}/></Suspense>;
  if(spec.kind==='biology'&&(spec.view==='food-web'||spec.view==='network'))return <Suspense fallback={<p role="status">{tr('common:题图加载中…')}</p>}><BiologyNetwork spec={spec}/></Suspense>;
  if(spec.kind==='geometry'||spec.kind==='function')return <Suspense fallback={<figure data-engine="jsxgraph" aria-busy="true">{tr('common:题图加载中…')}</figure>}><MathDiagram spec={spec}/></Suspense>;
  if(spec.kind==='optics')return <Suspense fallback={<figure data-engine="ray-optics" aria-busy="true">{tr('common:题图加载中…')}</figure>}><OpticsDiagram spec={spec}/></Suspense>;
  if(['measurement','wave','motion','forces','lever','buoyancy','statistics','biology'].includes(spec.kind)||spec.kind==='experiment'&&spec.setup==='inclined_cart')return <ScientificDiagram spec={parsed.data}/>;
  function exportSVG() {
    if (!ref.current) return;
    downloadDiagram(ref.current,'Reviewbox-'+spec.kind);
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
            measurement:'测量图',wave:'波形图',biology:'生物示意图',
            chemistry:'化学结构',macromolecule:'生物大分子',bioasset:'科学素材',
          }[spec.kind]
        }
      >
        <SemanticDrawing spec={parsed.data} id={id} />
      </svg>
      <figcaption>
        {spec.caption}
        <button type="button" className="diagram-export" onClick={exportSVG}>{tr("common:导出 SVG")}</button>
      </figcaption>
    </figure>
  );
}
