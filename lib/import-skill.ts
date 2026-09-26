import { EXAM_IMPORT_SKILL } from './exam-skill';
import { validatePack, smartParse } from './importer';
import type { Subject } from './model';
export function parseImportText(text: string, subject?: Subject) {
  let raw = text.trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) raw = fenced[1].trim();
  if (raw.startsWith('{') || raw.startsWith('[')) {
    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new Error(
        'JSON 格式不完整，请复制完整学习包，包括最外层的大括号。',
      );
    }
    const pack = validatePack(value);
    return { nodes: pack.knowledge, questions: pack.questions, pack };
  }
  if (raw.includes('schemaVersion'))
    throw new Error('检测到学习包内容，请复制完整 JSON 或 JSON 代码块。');
  return smartParse(raw, subject);
}
export const IMPORT_EXAMPLE = {
  schemaVersion: 1,
  manifest: {
    id: 'my-pack-demo',
    title: '二次函数练习',
    version: '1.0.0',
    subject: 'math',
    description: '原创练习',
    changelog: '初版',
    compatibility: 'Review 1.x',
  },
  knowledge: [
    {
      id: 'my-quadratic',
      subject: 'math',
      course: '数学',
      unit: '函数',
      chapter: '二次函数',
      title: '二次函数顶点',
      description: '利用配方理解顶点式。',
      prerequisites: [],
      relatedNodes: [],
      importance: 0.8,
      examWeight: 0.8,
      skills: [{ id: 'vertex', title: '求顶点', difficulty: 2 }],
      source: '外部 AI 原创',
      version: '1.0.0',
    },
  ],
  questions: [
    {
      schemaVersion: 1,
      id: 'my-quadratic-001',
      nodeId: 'my-quadratic',
      skillId: 'vertex',
      subject: 'math',
      type: 'choice',
      prompt: '函数 $y=(x-2)^2+3$ 的顶点是什么？',
      answer: '$(2,3)$',
      options: ['$(2,3)$', '$(-2,3)$', '$(2,-3)$', '$(-2,-3)$'],
      explanation: '顶点式 $y=(x-h)^2+k$ 的顶点是 $(h,k)$。',
      difficulty: 2,
      expectedSeconds: 30,
      variant: 'vertex-form',
      solution: [
        '已知顶点式。',
        '比较标准形式。',
        '$h=2, k=3$。',
        '检验代入 $x=2$ 得 $y=3$。',
        '顶点为 $(2,3)$。',
      ],
      source: '外部 AI 原创',
      tags: ['函数'],
      version: '1.0.0',
    },
  ],
};
export const IMPORT_SKILL =
  EXAM_IMPORT_SKILL +
  '\n\n' +
  `# Review 学习包出题 Skill · schemaVersion 1

根据我随后提供的学科、知识范围、难度、题量和题型，制作原创学习包。只输出一个合法 JSON 对象，可放在一个 json 代码块中。不要输出聊天说明，不要输出备份记录或个人掌握度。

## 必须遵守
- 顶层为 {schemaVersion:1,manifest:{id,title,version,subject,description,changelog,compatibility},knowledge:[],questions:[]}。compatibility 写 Review 1.x。
- subject 仅可选 chinese / math / english / ce / physics / chemistry / biology / history。CE 是 SAT/ACT 英语。各学科学习框架一致。
- knowledge 每项字段必须与下面示例一致。节点 ID 唯一；skills 至少一个，包含 id/title/difficulty。importance 和 examWeight 在 0–1。difficulty 是 1–5 整数。
- questions 必须包含示例中的必填字段，schemaVersion:1。每道题 nodeId 引用本包 knowledge 中的节点，subject 与该节点一致，skillId 必须属于该节点。id 在包内唯一。expectedSeconds 为 1–3600。
- 题型 type 可选 recall（回忆卡）、choice（选择）、blank（填空）、matching（连线）、pinyin（看拼音写汉字）、subjective（主观表达）。严格遵守我指定的题型范围。
- choice: options 为 2–6 个不同的完整选项字符串；answer 必须与其中一个完整字符串完全相同，不能只写 A/B/C/D。解释正确项与干扰项。
- blank: 数学填空的 answer 优先用不带 LaTeX 包裹的纯数字或分数（如 2、1/2），公式仍可用在题干与解析。prompt 用 ____ 表示空位，answer 是简洁答案；acceptedAnswers 可给等价表达字符串数组。多个空按题目声明的分隔符输入。
- pinyin: 系统不提供汉字输入框，显示答案后手动选择答对/不确定/答错。prompt 只给带声调拼音，answer 为汉字，explanation 为空字符串。一个字词对应一个 knowledge 节点与独立掌握度；同篇字词的 questions 使用相同 collectionId 与 collectionTitle（例如“藤野先生字词”），篇目是集合而非知识点。
- matching: matching:{left:[{id:"L1",text:"..."},{id:"L2",text:"..."}],right:[{id:"R2",text:"..."},{id:"R1",text:"..."}]}，两侧各 2–8 项，ID 独立且唯一，右侧打乱；answer 是 JSON 字符串，例如 "{\\"L1\\":\\"R1\\",\\"L2\\":\\"R2\\"}"。必须一一对应。explanation 用可读文字逐项解释。
- subjective: 提供 passage（依赖的完整原文）、answer（示例答案）与 rubric:[{id,title,max,description,skillId}]，每个评分点映射该节点中的有效能力。max 为正数，不能只给总分。
- 数学每题提供 solution 数组共五步：已知、方法、公式、推导、结论。用 $...$ 或 $$...$$ 包裹 LaTeX，遵守 JSON 转义，如反斜线写双反斜线。数值必须独立复算。
- 可选 diagram 支持 geometry/function_graph/physics。不要输出精确图形的 AI 图片；函数表达式仅用 x、数字、+ - * / ^ 和括号。
- 除 pinyin 外，每题必须有清楚的 explanation。题干、答案、解释与评分标准须一致。不要写 verified:true 或伪造核验结果。
- 内容更新使用相同的节点/题目 ID 和更高 version；新增内容使用新 ID。输出前自行检查 JSON、ID 引用、题量、题型与答案唯一性。

## 完整有效示例（更换为我要求的内容）
${JSON.stringify(IMPORT_EXAMPLE, null, 2)}
`;
