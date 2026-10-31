import type { Pack, Question, Subject } from './model';
import type { GradingRule } from './grading-rules';
import type { SemanticDiagram } from './diagram-spec';

function example(
  id: string,
  subject: Subject,
  title: string,
  prompt: string,
  answer: string,
  criteria: { title: string; condition: string; max: number }[],
  diagram?: SemanticDiagram,
  solo = false,
): Pack {
  const rule: GradingRule = {
    id: 'rule:' + id,
    version: '1.0.0',
    mode: solo
      ? 'rubric-solo'
      : ['math', 'physics'].includes(subject)
        ? 'steps'
        : 'points',
    maxScore: criteria.reduce((sum, c) => sum + c.max, 0),
    criteria: criteria.map((c, i) => ({
      id: id + '-c' + (i + 1),
      title: c.title,
      max: c.max,
      description: c.condition,
      fullCredit: c.condition,
      partialCredit: '判断依据正确但不完整时，可在本评分点范围内部分给分。',
      deductions: '只扣除本评分点缺失的部分，不重复扣分。',
      equivalentAnswers: [],
      skillId: 'reason',
      independentCredit: true,
      carryForward: ['math', 'physics'].includes(subject),
    })),
    ...(solo
      ? {
          solo: {
            levels: [
              {
                level: 'L1' as const,
                description: '回答与人物行为和题意无关。',
              },
              {
                level: 'L2' as const,
                description: '仅指出留伞或淋雨中的一个行为。',
              },
              {
                level: 'L3' as const,
                description: '列出多个行为与品质，但未解释它们的联系。',
              },
              {
                level: 'L4' as const,
                description:
                  '以文本行为为证据，将关爱他人与主动承担困难建立合理关联。',
              },
              {
                level: 'L5' as const,
                description:
                  '在准确分析本段的基础上，将责任意识迁移到新情境并说明适用边界。',
              },
            ],
            fullCreditLevel: 'L4' as const,
          },
        }
      : {}),
  };
  const q: Question = {
    schemaVersion: 1,
    id: id + '-q1',
    nodeId: id + '-node',
    skillId: 'reason',
    subject,
    type: 'subjective',
    prompt,
    answer,
    explanation: answer,
    difficulty: 2,
    expectedSeconds: 90,
    variant: id + '-initial',
    gradingRule: rule,
    source: '外部 AI 原创示例',
    tags: [title],
    version: '1.0.0',
    ...(diagram ? { diagram } : {}),
    ...(subject === 'math'
      ? {
          solution: [
            '读题，确定所给条件。',
            '选择符合条件的方法。',
            '列出关系并代入已知量。',
            '完成运算，保留单位或符号。',
            '将结论代回条件，检查合理性。',
          ],
        }
      : {}),
  };
  if (id === 'quality-geometry')
    q.solution = [
      '已知 ∠A=90°，AB=3，AC=4，BC 为斜边。',
      '使用勾股定理：BC²=AB²+AC²。',
      '代入：BC²=3²+4²=9+16=25。',
      '长度取正数，BC=√25=5。',
      '检查：3²+4²=5²，故 BC=5。',
    ];
  return {
    schemaVersion: 1,
    manifest: {
      id,
      title,
      version: '1.0.0',
      subject,
      description: '供外部 AI 参考的完整格式示例，不会自动安装。',
      changelog: '初版',
      compatibility: 'Review 1.x',
      scoringPolicy: {
        mode: 'auto',
        preferences: '按本题已确定的标准评分，保留合理过程分。',
      },
    },
    knowledge: [
      {
        id: id + '-node',
        subject,
        course: title,
        unit: title,
        chapter: title,
        title,
        description: title,
        prerequisites: [],
        relatedNodes: [],
        importance: 0.7,
        examWeight: 0.7,
        skills: [{ id: 'reason', title: '依据与推理', difficulty: 2 }],
        source: '外部 AI 原创示例',
        version: '1.0.0',
      },
    ],
    questions: [q],
  };
}
export const PROFESSIONAL_DIAGRAM_EXAMPLES: Record<string, SemanticDiagram> = {
  geometry: {
    type: 'semantic',
    kind: 'geometry',
    points: [
      { id: 'A', x: 0, y: 0 },
      { id: 'B', x: 3, y: 0 },
      { id: 'C', x: 0, y: 4 },
    ],
    segments: [
      ['A', 'B'],
      ['A', 'C'],
      ['B', 'C'],
    ],
    marks: [{ kind: 'right', points: ['B', 'A', 'C'] }],
  },
  function: {
    type: 'semantic',
    kind: 'function',
    xRange: [-2, 6],
    yRange: [-1, 12],
    tickX: 1,
    tickY: 2,
    functions: [{ expression: '(x-2)^2+3', label: 'y=(x-2)²+3' }],
    grid: true,
  },
  forces: {
    type: 'semantic',
    kind: 'forces',
    body: 'box',
    surface: 'horizontal',
    forces: [
      { id: 'g', kind: 'gravity', origin: 'center', angle: 270, label: 'G' },
      { id: 'n', kind: 'normal', origin: 'contact', angle: 90, label: 'N' },
    ],
  },
  optics: {
    type: 'semantic',
    kind: 'optics',
    lens: 'convex',
    focalLength: 10,
    objectDistance: 30,
    objectHeight: 4,
    showRays: false,
    showImage: false,
  },
  evaporation: {
    type: 'semantic',
    kind: 'experiment',
    setup: 'evaporation',
    apparatus: [
      { id: 'dish', kind: 'evaporating_dish', label: '蒸发皿' },
      { id: 'rod', kind: 'glass_rod', label: '玻璃棒' },
      { id: 'stand', kind: 'stand', label: '支架' },
      { id: 'lamp', kind: 'alcohol_lamp', label: '酒精灯' },
    ],
  },
};
export const QUALITY_IMPORT_EXAMPLES = [
  example(
    'quality-solo',
    'chinese',
    '人物分析与 SOLO',
    '结合“他把破伞留给孩子，自己走进雨里”，说明人物面对困难的态度。',
    '他把破伞留给孩子，自己走进雨里，表明他关爱孩子并愿意主动承担困难。',
    [
      {
        title: '文本依据',
        condition: '准确引用或转述留伞、淋雨的行为。',
        max: 2,
      },
      {
        title: '行为与品质关联',
        condition: '以行为为证据说明关爱他人、主动承担困难的关联。',
        max: 3,
      },
    ],
    undefined,
    true,
  ),
  example(
    'quality-geometry',
    'math',
    '勾股定理与过程分',
    '直角三角形 ABC 中，∠A=90°，AB=3，AC=4。求 BC，写出过程。',
    '由勾股定理 BC²=AB²+AC²=3²+4²=25，所以 BC=5。',
    [
      {
        title: '方法与关系',
        condition: '正确使用 BC²=AB²+AC²。该过程可独立得分。',
        max: 2,
      },
      {
        title: '代入与运算',
        condition:
          '代入 3²+4² 并计算。若上一步仅有算术错误，正确的后续开方过程仍可部分得分。',
        max: 2,
      },
      { title: '结论', condition: '得到正长度 BC=5。', max: 1 },
    ],
    PROFESSIONAL_DIAGRAM_EXAMPLES.geometry,
  ),
  example(
    'quality-force',
    'physics',
    '二力平衡',
    '图中物体静止在水平桌面上，重力为 10 N。求支持力并说明依据。',
    '物体处于静止状态，受重力和支持力这两个平衡力，支持力 N=G=10 N，方向竖直向上。',
    [
      {
        title: '概念与依据',
        condition:
          '说明静止状态下物体受平衡力，重力与支持力大小相等、方向相反。',
        max: 3,
      },
      {
        title: '结果与单位',
        condition: '得到支持力 10 N，方向竖直向上；单位独立考查。',
        max: 2,
      },
    ],
    PROFESSIONAL_DIAGRAM_EXAMPLES.forces,
  ),
  example(
    'quality-optics',
    'physics',
    '凸透镜成像',
    '凸透镜焦距为 10 cm，物距为 30 cm，物高为 4 cm。说明像的倒正、大小与虚实，并给出依据。',
    '物距大于 2 倍焦距，凸透镜成倒立、缩小的实像。',
    [
      { title: '条件判断', condition: '判断 30 cm > 2×10 cm。', max: 2 },
      {
        title: '规律与结论',
        condition: '根据物距大于二倍焦距说明倒立、缩小的实像，结论与条件相符。',
        max: 3,
      },
    ],
    PROFESSIONAL_DIAGRAM_EXAMPLES.optics,
  ),
  example(
    'quality-evaporation',
    'chemistry',
    '粗盐提纯蒸发',
    '粗盐提纯实验中，滤液放在蒸发皿中，用酒精灯加热。蒸发时玻璃棒有什么作用？',
    '不断搅拌，防止局部温度过高造成液滴飞溅。',
    [
      { title: '操作', condition: '指出用玻璃棒不断搅拌。', max: 2 },
      {
        title: '原理与现象',
        condition: '说明防止局部温度过高引起液滴飞溅。合理的同义表述给分。',
        max: 3,
      },
    ],
    PROFESSIONAL_DIAGRAM_EXAMPLES.evaporation,
  ),
];
