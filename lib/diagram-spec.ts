import { z } from 'zod';
import {scientificBase,scientificPhase,measurementSchema,waveSchema,biologySchema,chemistrySchema,macromoleculeSchema,bioAssetSchema,motionSeries,cartApparatus,finite,positive} from './scientific-schema';
import {scientificErrors} from './scientific-validation-core';
import { evaluateExpression } from './diagram-expression';
import {shadedRegionSchema,validateShadedRegions} from './shaded-regions';
const n = z.number().finite().min(-10000).max(10000),
  pos = z.number().positive().max(10000),
  label = z.string().max(60),
  id = z.string().min(1).max(60);
const point = z.object({ id, x: n, y: n, label: label.optional(),phase:scientificPhase.optional() });
const xy = z.tuple([n, n]);
const range = z
  .tuple([n, n])
  .refine(([a, b]) => b > a && b - a < 20000, '坐标范围无效');
const base = scientificBase;
const geometry = z.object({
  ...base,
  kind: z.literal('geometry'),
  regions:z.array(shadedRegionSchema).max(12).optional(),
  regionTask:z.enum(['read','construct']).optional(),
  auxiliary:z.array(z.tuple([id,id])).max(40).optional(),
  steps:z.array(z.object({id,label:label.optional(),phase:scientificPhase,segments:z.array(z.tuple([id,id])).max(20)})).max(12).optional(),
  bounds:z.tuple([n,n,n,n]).optional(),
  points: z.array(point).min(2).max(50),
  segments: z.array(z.tuple([id, id])).max(80),
  circles: z
    .array(z.object({ id, center: id, r: pos }))
    .max(20)
    .optional(),
  marks: z
    .array(
      z.object({
        kind: z.enum([
          'right',
          'parallel',
          'equal',
          'angle',
          'dimension',
          'tangent',
        ]),
        points: z.array(id).min(2).max(4),
        label: label.optional(),
        circleId: id.optional(),
        phase:scientificPhase.optional(),
      }),
    )
    .max(40)
    .optional(),
});
const functions = z.object({
  ...base,
  kind: z.literal('function'),
  regions:z.array(shadedRegionSchema).max(12).optional(),
  regionTask:z.enum(['read','construct']).optional(),
  xRange: range,
  yRange: range,
  functions: z
    .array(
      z.object({
        expression: z.string().min(1).max(250),
        domain:range.optional(),phase:scientificPhase.optional(),
        label: label.optional(),
      }),
    )
    .min(1)
    .max(5),
  tickX: pos.optional(),
  tickY: pos.optional(),
  keyPoints: z.array(point).max(20).optional(),
  grid: z.boolean().optional(),xLabel:label.optional(),yLabel:label.optional(),
});
const forces = z.object({
  ...base,
  kind: z.literal('forces'),
  body: z.enum(['box', 'sphere']),
  surface: z.enum(['none', 'horizontal', 'incline']),
  incline: n.min(-60).max(60).optional(),
  forces: z
    .array(
      z.object({
        id,
        kind: z.enum(['gravity', 'normal', 'friction', 'applied','tension','pressure','spring']),
        label,
        origin: z.enum(['center', 'contact', 'top']),
        angle: n,
        magnitude: pos.optional(),phase:scientificPhase.optional(),bodyId:id.optional(),at:xy.optional(),
      }),
    )
    .min(1)
    .max(12),
 mass:positive.optional(),g:positive.optional(),equilibrium:z.boolean().optional(),acceleration:z.tuple([finite,finite]).optional(),friction:z.object({type:z.enum(['static','sliding']),coefficient:z.number().min(0).max(3),motionDirection:z.enum(['up','down']).optional()}).optional(),spring:z.object({constant:positive,extension:positive}).optional(),bodies:z.array(z.object({id,x:finite,y:finite,label:label.optional()})).max(5).optional(),interactions:z.array(z.object({first:id,second:id})).max(5).optional(),
});
const optics = z.object({
  ...base,
  kind: z.literal('optics'),
  opticalElement:z.enum(['lens','mirror','interface']).optional(),view:z.enum(['imaging','parallel','reflection','apparatus']).optional(),medium1:label.optional(),medium2:label.optional(),
  lens: z.enum(['convex', 'concave']).optional(),
  focalLength: pos.optional(),
  objectDistance: pos.optional(),
  objectHeight: pos.optional(),
  mirrorAngle:n.optional(),
  refractiveIndex1:z.number().positive().max(5).optional(),
  refractiveIndex2:z.number().positive().max(5).optional(),
  incidenceAngle:z.number().min(-89.9999).max(89.9999).optional(),
  imagePhase:z.enum(['question','hint','solution']).optional(),
  raysPhase:z.enum(['question','hint','solution']).optional(),
  showDistances:z.boolean().optional(),
  showRays: z.boolean().default(false),
  showImage: z.boolean().default(false),
});
const apparatusTypes = [
  'evaporating_dish',
  'glass_rod',
  'funnel',
  'beaker',
  'test_tube',
  'alcohol_lamp',
  'stand',
  'filter_paper',
  'delivery_tube',
  'graduated_cylinder',
] as const;
const experiment = z.object({
  ...base,
  kind: z.literal('experiment'),
  setup: z.enum(['evaporation', 'filtration', 'apparatus','inclined_cart']),cart:cartApparatus.optional(),
  apparatus: z
    .array(
      z.object({
        id,
        kind: z.enum(apparatusTypes),
        label: label.optional(),
        liquidLevel: z.number().min(0).max(1).optional(),
      }),
    )
    .min(0)
    .max(10),
  connections: z
    .array(
      z.object({
        from: id,
        to: id,
        relation: z.enum(['inside', 'above', 'tube']),
      }),
    )
    .max(12)
    .optional(),
});
const circuit = z.object({
  ...base,
  kind: z.literal('circuit'),
  nodes: z.array(point).min(2).max(30),
  components: z
    .array(
      z.object({
        id,
        kind: z.enum([
          'wire',
          'battery',
          'switch_open',
          'switch_closed',
          'resistor',
          'lamp',
          'ammeter',
          'voltmeter','variable_resistor',
        ]),
        from: id,
        to: id,
        label: label.optional(),resistance:positive.optional(),voltage:positive.optional(),
      }),
    )
    .min(1)
    .max(40),
});
const statistics = z.object({
  ...base,
  kind: z.literal('statistics'),
  chart: z.enum(['bar', 'line', 'numberline','scatter','histogram','boxplot']),
  data: z
    .array(z.object({ label, value: n,x:n.optional() }))
    .min(0)
    .max(15).default([]),
  unit: label.optional(),
  bins:z.array(z.object({from:n,to:n,count:z.number().nonnegative().max(1e6)})).max(30).optional(),
  summary:z.object({min:n,q1:n,median:n,q3:n,max:n}).optional(),xUnit:label.optional(),
});
const lever = z.object({
  ...base,
  kind: z.literal('lever'),
  pivot: n.default(0),
  loads: z
    .array(z.object({ position: n, force: n, label }))
    .min(0)
    .max(8).default([]),
  equilibrium: z.boolean().optional(),mechanism:z.enum(['lever','fixed-pulley','movable-pulley','pulley-block','inclined-plane']).optional(),supportingStrands:z.number().int().min(1).max(6).optional(),load:positive.optional(),effort:positive.optional(),efficiency:z.number().positive().max(1).optional(),height:positive.optional(),length:positive.optional(),armsPhase:scientificPhase.optional(),showArms:z.boolean().optional(),
});
const buoyancy = z.object({
  ...base,
  kind: z.literal('buoyancy'),
  submerged: z.number().min(0).max(1),
  bodyLabel: label.optional(),
  liquidLabel: label.optional(),
  showForces: z.boolean().default(false),density:positive.optional(),volume:positive.optional(),mass:positive.optional(),g:positive.optional(),state:z.enum(['floating','suspended','sinking']).optional(),forcesPhase:scientificPhase.optional(),
});
const motion = z.object({
  ...base,
  kind: z.literal('motion'),
  positions: z
    .array(
      z.object({
        x: n,
        time: z.number().nonnegative(),
        label: label.optional(),
      }),
    )
    .min(0)
    .max(12).default([]),
  direction: z.enum(['left', 'right']).optional(),chart:z.enum(['position','distance-time','velocity-time']).optional(),series:z.array(motionSeries).min(1).max(4).optional(),timeUnit:z.enum(['s','min','h']).optional(),valueUnit:z.enum(['m','cm','km','m/s','km/h','cm/s']).optional(),tickX:positive.optional(),tickY:positive.optional(),
});
export const semanticDiagramStructureSchema = z
  .discriminatedUnion('kind', [
    geometry,
    functions,
    forces,
    optics,
    experiment,
    circuit,
    statistics,
    lever,
    buoyancy,
    motion,measurementSchema,waveSchema,biologySchema,chemistrySchema,macromoleculeSchema,bioAssetSchema,
  ]);
export const semanticDiagramSchema = semanticDiagramStructureSchema.superRefine((s, ctx) => {
    const problem = (message: string) =>
      ctx.addIssue({ code: 'custom', message });
    for(const error of scientificErrors(s))problem(error);
    if(s.kind==='geometry'||s.kind==='function')for(const error of validateShadedRegions(s))problem(error);
    if (s.kind === 'geometry') {
      const p = new Map(s.points.map((p) => [p.id, p]));
      if (p.size !== s.points.length) problem('几何点 ID 重复');
      const cs = new Map(s.circles?.map((c) => [c.id, c]) ?? []);
      if(cs.size!==(s.circles??[]).length)problem('圆 ID 重复');
      if(s.bounds&&(s.bounds[2]<=s.bounds[0]||s.bounds[3]<=s.bounds[1]))problem('几何显示范围无效');
      for(const pair of s.auxiliary??[])if(pair.some(id=>!p.has(id)))problem('辅助线引用不存在的点');
      for(const step of s.steps??[])for(const pair of step.segments)if(pair.some(id=>!p.has(id)))problem('作图步骤引用不存在的点');
      for (const c of cs.values()) if (!p.has(c.center)) problem('圆心不存在');
      for (const [a, b] of s.segments)
        if (
          !p.has(a) ||
          !p.has(b) ||
          a === b ||
          Math.hypot(p.get(a)!.x - p.get(b)!.x, p.get(a)!.y - p.get(b)!.y) <
            1e-8
        )
          problem('线段引用缺失或长度为零');
      for (const m of s.marks ?? []) {
        if (m.points.some((id) => !p.has(id))) {
          problem('几何标记引用不存在的点');
          continue;
        }
        const ps = m.points.map((id) => p.get(id)!);
        const vec = (a: number, b: number) => [
          ps[b].x - ps[a].x,
          ps[b].y - ps[a].y,
        ];
        if (m.kind === 'right') {
          if (ps.length !== 3) {
            problem('直角需要三个点（中间为顶点）');
            continue;
          }
          const a = vec(1, 0),
            b = vec(1, 2),
            den = Math.hypot(...a) * Math.hypot(...b);
          if (den < 1e-8 || Math.abs(a[0] * b[0] + a[1] * b[1]) / den > 0.001)
            problem('直角标记与坐标不符');
        }
        if (m.kind === 'parallel' || m.kind === 'equal') {
          if (ps.length !== 4) {
            problem('平行或等长标记需要两条线段的四个点');
            continue;
          }
          const a = vec(0, 1),
            b = vec(2, 3),
            la = Math.hypot(...a),
            lb = Math.hypot(...b);
          if (
            la * lb < 1e-8 ||
            (m.kind === 'parallel'
              ? Math.abs(a[0] * b[1] - a[1] * b[0]) / (la * lb) > 0.001
              : Math.abs(la - lb) / Math.max(la, lb) > 0.001)
          )
            problem('几何标记与坐标关系不符');
        }
        if (m.kind === 'angle' && ps.length !== 3) problem('角弧需要三个点');
        if (m.kind === 'dimension' && (ps.length !== 2||Math.hypot(...vec(0,1))<1e-8))
          problem('尺寸线需要两个端点');
        if (m.kind === 'tangent') {
          const c = cs.get(m.circleId ?? ''),
            center = c && p.get(c.center);
          if (ps.length !== 2 || !c || !center) {
            problem('切线需要切点、线上另一点及圆');
            continue;
          }
          const r = [ps[0].x - center.x, ps[0].y - center.y],
            v = vec(0, 1);
          if (
            Math.hypot(...v)<1e-8 ||
            Math.abs(Math.hypot(...r) - c.r) / c.r > 0.001 ||
            Math.abs(r[0] * v[0] + r[1] * v[1]) / (c.r * Math.hypot(...v)) >
              0.001
          )
            problem('切线不满足垂直半径且过切点');
        }
      }
    }
    if (s.kind === 'function') {
      for (const f of s.functions)
        try {
          evaluateExpression(f.expression, 0.371);
        } catch {
          problem('函数表达式包含不支持的符号');
        }
      for (const p of s.keyPoints ?? [])
        if (
          p.x < s.xRange[0] ||
          p.x > s.xRange[1] ||
          p.y < s.yRange[0] ||
          p.y > s.yRange[1]
        )
          problem('关键点超出坐标范围');
    }
    if (s.kind === 'forces')
      for (const f of s.forces) {
        const angle = ((f.angle % 360) + 360) % 360,
          close = (a: number, b: number) =>
            Math.abs(((a - b + 540) % 360) - 180) < 0.01;
        if (
          f.kind === 'gravity' &&
          (!close(angle, 270) || f.origin !== 'center')
        )
          problem('重力必须竖直向下且作用于重心');
        if (
          f.kind === 'normal' &&
          s.surface !== 'none' &&
          (!close(
            angle,
            90 + (s.surface === 'incline' ? (s.incline ?? 0) : 0),
          ) ||
            f.origin !== 'contact')
        )
          problem('支持力必须从接触处垂直于接触面');
        if (
          f.kind === 'friction' &&
          s.surface !== 'none' &&
          !close(angle, s.incline ?? 0) &&
          !close(angle, 180 + (s.incline ?? 0))
        )
          problem('摩擦力必须沿接触面');
      }
    if (
      s.kind === 'optics' && s.objectDistance&&s.objectHeight&&s.focalLength&&
      (s.objectDistance / s.focalLength > 12 ||
        s.objectHeight / s.focalLength > 5)
    )
      problem('物距或物高与焦距比例过大，请分图表示');
    if(s.kind==='optics'){
      if((!s.opticalElement||s.opticalElement==='lens')&&(!s.lens||!s.focalLength||s.view!=='parallel'&&!s.objectDistance))problem('透镜需要类型、焦距、物距；平行光模式不需要物距');
      if(s.mode==='quantitative'&&s.view!=='parallel'&&s.view!=='reflection'&&s.opticalElement!=='interface'&&!s.objectHeight)problem('定量成像需要物高；未知时使用 schematic 模式');
      if(s.view==='reflection'&&s.incidenceAngle===undefined)problem('反射图需要入射角');
      if(s.opticalElement==='mirror'&&s.view!=='reflection'&&!s.objectDistance)problem('平面镜成像需要物距');
      if(s.opticalElement==='interface'&&(s.refractiveIndex1===undefined||s.refractiveIndex2===undefined||s.incidenceAngle===undefined))problem('折射题必须提供两侧折射率和入射角');
    }
    if (s.kind === 'experiment') {
      const ids = new Set(s.apparatus.map((a) => a.id));
      if (ids.size !== s.apparatus.length) problem('器材 ID 重复');
      for (const c of s.connections ?? [])
        if (!ids.has(c.from) || !ids.has(c.to) || c.from === c.to)
          problem('器材连接引用无效');
      if (
        s.setup === 'evaporation' &&
        !s.apparatus.some((a) => a.kind === 'evaporating_dish')
      )
        problem('蒸发装置缺少蒸发皿');
      if (
        s.setup === 'filtration' &&
        !s.apparatus.some((a) => a.kind === 'funnel')
      )
        problem('过滤装置缺少漏斗');
      for (const a of s.apparatus)
        if (
          a.label &&
          /防止.*飞溅|作用是|答案|正确选项|应当|必须|搅拌使|受热均匀/.test(
            a.label,
          )
        )
          problem('题图标签包含操作答案，请移入解析');
    }
    if (s.kind === 'circuit') {
      const ids = new Set(s.nodes.map((p) => p.id));
      if (ids.size !== s.nodes.length) problem('电路节点 ID 重复');
      for (const c of s.components)
        if (!ids.has(c.from) || !ids.has(c.to) || c.from === c.to)
          problem('电路元件连接无效');
    }
    if (
      s.kind === 'lever' &&
      s.equilibrium &&
      Math.abs(
        s.loads.reduce((sum, l) => sum + (l.position - s.pivot) * l.force, 0),
      ) > 0.001
    )
      problem('杠杆力矩不满足声明的平衡条件');
    if (
      s.kind === 'motion' &&
      s.positions.some((p, i) => i > 0 && p.time <= s.positions[i - 1].time)
    )
      problem('运动时刻必须严格递增');
  });
export type SemanticDiagram = z.infer<typeof semanticDiagramSchema>;
const legacyDiagramSchema = z
  .object({
    type: z.enum(['geometry', 'function_graph', 'physics']),
    canvas: z.object({ width: pos, height: pos }).optional(),
    points: z.array(point).max(100).optional(),
    segments: z.array(z.array(id).length(2)).max(100).optional(),
    labels: z.boolean().optional(),
    functions: z
      .array(z.object({ expression: z.string().max(250), label }))
      .max(5)
      .optional(),
    xRange: range.optional(),
    yRange: range.optional(),
    showGrid: z.boolean().optional(),
    showAxes: z.boolean().optional(),
    circles: z
      .array(z.object({ x: n, y: n, r: pos, label: label.optional() }))
      .max(30)
      .optional(),
    arrows: z
      .array(z.object({ x1: n, y1: n, x2: n, y2: n, label: label.optional() }))
      .max(40)
      .optional(),
    polygons: z
      .array(
        z.object({
          points: z.array(xy).min(3).max(30),
          fill: z.string().max(30).optional(),
        }),
      )
      .max(40)
      .optional(),
    angles: z
      .array(
        z.object({
          x: n,
          y: n,
          r: pos,
          start: n,
          end: n,
          label: label.optional(),
        }),
      )
      .max(40)
      .optional(),
    labelsText: z
      .array(z.object({ x: n, y: n, text: label }))
      .max(60)
      .optional(),
    rects: z
      .array(
        z.object({
          x: n,
          y: n,
          width: pos,
          height: pos,
          label: label.optional(),
          liquid: z.boolean().optional(),
        }),
      )
      .max(40)
      .optional(),
  })
  .superRefine((s, ctx) => {
    const ids = new Set(s.points?.map((p) => p.id));
    for (const pair of s.segments ?? [])
      if (pair.some((id) => !ids.has(id)))
        ctx.addIssue({ code: 'custom', message: '图形线段引用不存在的点' });
    for (const f of s.functions ?? [])
      try {
        evaluateExpression(f.expression, 0.371);
      } catch {
        ctx.addIssue({ code: 'custom', message: '函数表达式格式无效' });
      }
  });
export const diagramSchema = z.union([
  semanticDiagramSchema,
  legacyDiagramSchema,
]);
export function inspectDiagram(value: unknown) {
  const parsed = diagramSchema.safeParse(value);
  return parsed.success
    ? { ok: true as const, spec: parsed.data }
    : {
        ok: false as const,
        problems: parsed.error.issues.map((i) => i.message),
      };
}
