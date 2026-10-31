import type { Node, Question, Pack, Grade } from '../../lib/model';
import type { GradingRule } from '../../lib/grading-rules';
import type { SemanticDiagram } from '../../lib/diagram-spec';
export const qualityNode: Node = {
  id: 'quality-node',
  subject: 'math',
  course: '数学',
  unit: '代数',
  chapter: '方程',
  title: '方程与推理',
  description: '用等式性质求解',
  prerequisites: [],
  relatedNodes: [],
  importance: 0.7,
  examWeight: 0.7,
  skills: [{ id: 'reason', title: '依据与推理', difficulty: 2 }],
  source: '验收样本',
  version: '1',
};
export const qualityQuestion: Question = {
  schemaVersion: 1,
  id: 'quality-question',
  nodeId: qualityNode.id,
  skillId: 'reason',
  subject: 'math',
  type: 'recall',
  prompt: '解方程 2x+2=8。',
  answer: '3',
  explanation: '先减去 2，再除以 2，代入检验。',
  difficulty: 2,
  expectedSeconds: 60,
  variant: 'linear',
  source: '验收样本',
  tags: [],
  version: '1.0.0',
  solution: [
    '已知 2x+2=8。',
    '利用等式性质移项。',
    '两边减去 2，得到 2x=6。',
    '两边除以 2，得到 x=3。',
    '代入原式：2×3+2=8，因此 x=3。',
  ],
};
export const qualityRule: GradingRule = {
  id: 'rule:quality',
  version: '1.0.0',
  mode: 'steps',
  maxScore: 5,
  criteria: [
    {
      id: 'method',
      title: '方法与等式变形',
      max: 3,
      description: '正确应用等式性质得到 2x=6。',
      fullCredit: '正确应用等式性质得到 2x=6。',
      partialCredit: '方法正确但存在一次计算错误，可得 1–2 分。',
      deductions: '不得因最后答案错误而取消已经完成的正确过程。',
      skillId: 'reason',
      independentCredit: true,
      carryForward: true,
    },
    {
      id: 'answer',
      title: '计算与结论',
      max: 2,
      description: '得到并检验 x=3。',
      skillId: 'reason',
      equivalentAnswers: ['x = 3', '3'],
    },
  ],
};
export function subjectExample(
  subject: 'chinese' | 'math' | 'physics' | 'chemistry' | 'history',
) {
  const examples = {
    chinese: {
      prompt:
        '这段文字怎样表现人物面对困难时的态度？请结合“他把破伞留给孩子，自己走进雨里”作答。',
      answer: '他把破伞留给孩子，自己走进雨里，表明他关爱孩子并愿意承担困难。',
      titles: ['文本证据', '人物与情境关联'],
      descriptions: [
        '引用或准确转述原文行为。',
        '将行为、人物品质和困难情境建立合理联系。',
      ],
    },
    math: {
      prompt: qualityQuestion.prompt,
      answer: '两边减去 2，得到 2x=6；两边除以 2，x=3。',
      titles: ['等式变形', '计算与结论'],
      descriptions: [
        '正确等式变形，允许独立过程分。',
        '正确计算得到 x=3，合理错误传递不重复扣分。',
      ],
    },
    physics: {
      prompt: '物体以 3 m/s 匀速运动 4 s，求路程。写出公式和单位。',
      answer: 's=vt=3×4=12 m。',
      titles: ['公式与代入', '运算和单位'],
      descriptions: ['选择 s=vt 并代入 3 和 4。', '计算得到 12，写出单位 m。'],
    },
    chemistry: {
      prompt: '粗盐提纯蒸发时，玻璃棒的作用是什么？',
      answer: '用玻璃棒不断搅拌，防止局部温度过高造成液滴飞溅。',
      titles: ['操作与现象', '原理说明'],
      descriptions: [
        '说明搅拌并防止液滴飞溅。',
        '将局部温度过高与飞溅建立因果联系。',
      ],
    },
    history: {
      prompt: '分析工业革命怎样促进城市人口增长。',
      answer:
        '工厂创造工作机会，吸引农村人口进城；产业集中又带动交通和服务业，进一步增加城市人口。',
      titles: ['史实与机制', '因果关联'],
      descriptions: [
        '说明工厂和就业机会的变化。',
        '合理连接人口迁移、产业集中与城市化，不要求额外史实。',
      ],
    },
  };
  const e = examples[subject],
    node = {
      ...qualityNode,
      id: 'example-' + subject,
      subject,
      title: subject + '分析',
    },
    rule: GradingRule = {
      id: 'rule:' + subject,
      version: '1.0.0',
      mode:
        subject === 'chinese'
          ? 'rubric-solo'
          : subject === 'math' || subject === 'physics'
            ? 'steps'
            : 'points',
      maxScore: 5,
      criteria: e.titles.map((title, i) => ({
        id: 'c' + i,
        title,
        max: i === 0 ? 2 : 3,
        description: e.descriptions[i],
        fullCredit: e.descriptions[i],
        partialCredit: '依据正确但不完整，可酌情部分给分。',
        skillId: 'reason',
        independentCredit: true,
        carryForward: subject === 'math' || subject === 'physics',
      })),
      ...(subject === 'chinese'
        ? {
            solo: {
              levels: [
                {
                  level: 'L1' as const,
                  description: '回答与人物行为及题意无关。',
                },
                {
                  level: 'L2' as const,
                  description: '只指出留伞或淋雨的一个行为。',
                },
                {
                  level: 'L3' as const,
                  description: '指出多个行为或品质，但未说明联系。',
                },
                {
                  level: 'L4' as const,
                  description:
                    '用文本行为证据说明人物关爱他人、主动承担困难的关联。',
                },
                {
                  level: 'L5' as const,
                  description:
                    '在准确分析本段的基础上迁移到承担责任的更一般情境，且有合理边界。',
                },
              ],
              fullCreditLevel: 'L4' as const,
            },
          }
        : {}),
    };
  const question: Question = {
    ...qualityQuestion,
    id: 'example-q-' + subject,
    nodeId: node.id,
    subject,
    type: 'subjective',
    prompt: e.prompt,
    answer: e.answer,
    rubric: rule.criteria,
    gradingRule: rule,
  };
  return {
    node,
    question,
    student: e.answer,
    rule,
    raw: {
      criteria: rule.criteria.map((c) => ({
        id: c.id,
        score: c.max,
        evidence: e.answer,
        missing: '',
        suggestion: '保留这样的论证。',
      })),
      exampleAnswer: e.answer,
      feedback: '回答有明确依据。',
      ...(subject === 'chinese'
        ? {
            solo: {
              level: 'L4',
              reason: '行为证据与人物态度建立了关联。',
              evidence: e.answer,
            },
          }
        : {}),
    },
  };
}
export const raster =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN8sAAAAASUVORK5CYII=';
export const evaporation: Extract<SemanticDiagram, { kind: 'experiment' }> = {
  type: 'semantic',
  kind: 'experiment',
  setup: 'evaporation',
  apparatus: [
    { id: 'dish', kind: 'evaporating_dish', label: '蒸发皿', liquidLevel: 0.3 },
    { id: 'rod', kind: 'glass_rod', label: '玻璃棒' },
    { id: 'stand', kind: 'stand', label: '支架' },
    { id: 'lamp', kind: 'alcohol_lamp', label: '酒精灯' },
  ],
};
export function qualityPack(id = 'quality-pack', version = '1.0.0'): Pack {
  return {
    schemaVersion: 1,
    manifest: {
      id,
      title: '方程的过程评分与图形',
      version,
      subject: 'math',
      description: '导入质量验收',
      changelog: '',
      compatibility: 'Review 1.x',
    },
    knowledge: [structuredClone(qualityNode)],
    questions: [structuredClone(qualityQuestion)],
  };
}
export function importFixtures() {
  const withRule = qualityPack('import-rubric');
  withRule.questions[0] = {
    ...withRule.questions[0],
    type: 'subjective',
    rubric: qualityRule.criteria,
    gradingRule: qualityRule,
  };
  const missingRule = qualityPack('import-missing');
  missingRule.questions[0].type = 'subjective';
  const structured = qualityPack('import-diagram');
  structured.questions[0].diagram = {
    type: 'semantic',
    kind: 'geometry',
    points: [
      { id: 'A', x: 0, y: 0 },
      { id: 'B', x: 4, y: 0 },
      { id: 'C', x: 0, y: 3 },
    ],
    segments: [
      ['A', 'B'],
      ['B', 'C'],
      ['C', 'A'],
    ],
    marks: [{ kind: 'right', points: ['B', 'A', 'C'] }],
  };
  const image = qualityPack('import-image');
  image.questions[0].media = [
    { id: 'original', src: raster, alt: '外部来源原图' },
  ];
  const update = structuredClone(withRule);
  update.manifest.version = '2.0.0';
  update.questions[0].gradingRule = {
    ...qualityRule,
    version: '2.0.0',
    criteria: qualityRule.criteria.map((c, i) => ({
      ...c,
      description: i === 0 ? '明确展示两边同减 2 的过程。' : c.description,
    })),
  };
  update.questions[0].rubric = update.questions[0].gradingRule.criteria;
  return { withRule, missingRule, structured, image, update };
}
export function fiftyDiagrams(): SemanticDiagram[] {
  const diagrams: SemanticDiagram[] = [];
  for (let i = 0; i < 10; i++) {
    diagrams.push({
      type: 'semantic',
      kind: 'geometry',
      points: [
        { id: 'A', x: 0, y: 0 },
        { id: 'B', x: 3 + i * 0.2, y: 0 },
        { id: 'C', x: 0, y: 4 + i * 0.2 },
      ],
      segments: [
        ['A', 'B'],
        ['B', 'C'],
        ['C', 'A'],
      ],
      marks: [{ kind: 'right', points: ['B', 'A', 'C'] }],
    });
    diagrams.push({
      type: 'semantic',
      kind: 'function',
      xRange: [-5, 5],
      yRange: [-5, 12],
      functions: [
        {
          expression: i % 2 ? `${1 + i * 0.1}*x+1` : `${1 + i * 0.1}*x^2-2`,
          label: '函数',
        },
      ],
      grid: i % 2 === 0,
    });
    diagrams.push({
      type: 'semantic',
      kind: 'forces',
      body: i % 2 ? 'sphere' : 'box',
      surface: 'horizontal',
      forces: [
        {
          id: 'g',
          kind: 'gravity',
          origin: 'center',
          angle: 270,
          magnitude: 10 + i,
          label: 'G',
        },
        {
          id: 'n',
          kind: 'normal',
          origin: 'contact',
          angle: 90,
          magnitude: 10 + i,
          label: 'N',
        },
        ...(i % 2
          ? [
              {
                id: 'f',
                kind: 'applied' as const,
                origin: 'center' as const,
                angle: 0,
                magnitude: 5,
                label: 'F',
              },
            ]
          : []),
      ],
    });
    diagrams.push({
      type: 'semantic',
      kind: 'optics',
      lens: i % 2 ? 'concave' : 'convex',
      focalLength: 10,
      objectDistance: 12 + i * 3,
      objectHeight: 3,
      showRays: true,
      showImage: true,
    });
    diagrams.push(
      i < 4
        ? {
            ...evaporation,
            apparatus:
              evaporation.kind === 'experiment'
                ? evaporation.apparatus.map((a) => ({
                    ...a,
                    liquidLevel:
                      a.kind === 'evaporating_dish' ? 0.1 + i * 0.1 : undefined,
                  }))
                : [],
          }
        : i < 7
          ? {
              type: 'semantic',
              kind: 'experiment',
              setup: 'filtration',
              apparatus: [
                { id: 'f', kind: 'funnel', label: '漏斗' },
                { id: 'paper', kind: 'filter_paper', label: '滤纸' },
                { id: 'b', kind: 'beaker', label: '烧杯', liquidLevel: 0.3 },
              ],
            }
          : {
              type: 'semantic',
              kind: 'experiment',
              setup: 'apparatus',
              apparatus: [
                { id: 'tube', kind: 'test_tube', label: '试管' },
                {
                  id: 'c',
                  kind: 'graduated_cylinder',
                  label: '量筒',
                  liquidLevel: 0.5,
                },
                { id: 'r', kind: 'delivery_tube', label: '导管' },
              ],
            },
    );
  }
  return diagrams;
}
