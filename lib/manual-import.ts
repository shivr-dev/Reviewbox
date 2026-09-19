import {
  uid,
  subjectName,
  type Subject,
  type Node,
  type Question,
} from './model';
import { questionSchema } from './importer';
import { assertQuestionFormat } from './question-tools';
export const CHINESE_IMPORT_TYPES = [
  { id: 'pinyin', label: '看拼音写汉字', type: 'pinyin', skill: '字词记忆' },
  { id: 'words', label: '字词解释 / 成语', type: 'recall', skill: '词义理解' },
  {
    id: 'poem',
    label: '古诗文背诵 / 上下句',
    type: 'recall',
    skill: '内容记忆',
  },
  { id: 'poem-blank', label: '古诗文填空', type: 'blank', skill: '名句记忆' },
  {
    id: 'translation',
    label: '文言文翻译',
    type: 'subjective',
    skill: '文言翻译',
  },
  {
    id: 'reading',
    label: '阅读理解 / 古诗鉴赏',
    type: 'subjective',
    skill: '主旨分析',
  },
  { id: 'choice', label: '语文选择题', type: 'choice', skill: '辨析与理解' },
  {
    id: 'matching',
    label: '作者、作品、词义连线',
    type: 'matching',
    skill: '关联识记',
  },
];
export const GENERAL_IMPORT_TYPES = [
  { id: 'recall', label: '回忆题', type: 'recall', skill: '内容记忆' },
  { id: 'choice', label: '选择题', type: 'choice', skill: '辨析理解' },
  { id: 'blank', label: '填空题', type: 'blank', skill: '知识运用' },
  { id: 'matching', label: '连线题', type: 'matching', skill: '关联识记' },
  { id: 'subjective', label: '主观题', type: 'subjective', skill: '表达分析' },
];
export function manualExample(id: string, subject: Subject) {
  if (id === 'pinyin')
    return 'jǔ sàng｜沮丧｜灰心失望。\nláng jí｜狼藉｜杂乱不堪。';
  if (id === 'matching')
    return '题干：将作者与作品对应。\n配对：李白 => 静夜思\n杜甫 => 春望\n解析：李白作《静夜思》，杜甫作《春望》。';
  if (id === 'poem')
    return '题干：《静夜思》中“床前明月光”的下一句是什么？\n答案：疑是地上霜。\n解析：李白《静夜思》，前两句描写月夜所见。';
  if (id === 'poem-blank')
    return '题干：床前明月光，____。\n答案：疑是地上霜\n解析：李白《静夜思》。';
  if (id === 'words')
    return '题干：“温故知新”是什么意思？\n答案：温习旧的知识，可以获得新的理解和体会。\n解析：出自《论语》。';
  if (id === 'translation')
    return '原文：学而时习之，不亦说乎？\n题干：翻译以上句子。\n答案：学习并按时温习，不也是很愉快的吗？\n解析：“时”指按时，“说”同“悦”。\n评分点：正确翻译“时习”；正确翻译“说”。';
  if (id === 'reading')
    return '原文：举头望明月，低头思故乡。\n题干：这两句诗表达了诗人怎样的情感？\n答案：表达了诗人对故乡的思念。\n解析：由望月转入思乡，情感自然流露。\n评分点：指出思乡之情；结合诗句解释。';
  if (id === 'choice' && subject === 'chinese')
    return '题干：下列词语中，表示杂乱不堪的是哪一项？\nA. 狼藉\nB. 整齐\nC. 安静\n答案：A\n解析：“狼藉”表示杂乱不堪。';
  return id === 'choice'
    ? '题干：请填写题目。\nA. 正确选项\nB. 干扰选项\n答案：A\n解析：请填写解析。'
    : id === 'blank'
      ? '题干：请填写带有 ____ 的题目。\n答案：填空答案\n解析：请填写解析。'
      : '题干：请填写题目。\n答案：请填写参考答案。\n解析：请填写解析。';
}
export function parseManualImport(
  source: string,
  subject: Subject,
  preset: string,
  title: string,
) {
  if (!source.trim()) throw Error('请先填写题目内容。');
  if (source.length > 300000) throw Error('每次最多导入 30 万字，请分批导入。');
  const spec = (
    subject === 'chinese' ? CHINESE_IMPORT_TYPES : GENERAL_IMPORT_TYPES
  ).find((t) => t.id === preset);
  if (!spec) throw Error('请选择题型。');
  const node: Node = {
    id: uid(),
    subject,
    course: subjectName(subject),
    unit: '手动导入',
    chapter: title.trim() || spec.label,
    title: title.trim() || spec.label,
    description: spec.label,
    prerequisites: [],
    relatedNodes: [],
    importance: 0.7,
    examWeight: 0.7,
    skills: [{ id: 'practice', title: spec.skill, difficulty: 2 }],
    source: '手动导入',
    version: '1.0.0',
  };
  const blocks =
    preset === 'pinyin'
      ? source
          .trim()
          .split(/\r?\n/)
          .filter((s) => s.trim())
      : source.trim().split(/\n\s*---+\s*\n/);
  if (blocks.length > 300) throw Error('每批最多 300 道题。');
  const questions = blocks.map((block, index) => {
    const fields: Record<string, string> = {};
    let active = '';
    const options: string[] = [];
    if (preset === 'pinyin') {
      const parts = block.split(/[｜|\t]/).map((s) => s.trim());
      if (parts.length < 2 || !parts[0] || !parts[1])
        throw Error(`第 ${index + 1} 行请按“拼音｜汉字｜解释”填写。`);
      fields['题干'] = parts[0];
      fields['答案'] = parts[1];
      fields['解析'] =
        parts.slice(2).join('｜') || '回忆或纸上书写后，揭晓答案并手动判断。';
    } else
      for (const line of block.split(/\r?\n/)) {
        const field = line.match(
          /^(题干|答案|解析|原文|评分点|配对)\s*[:：]\s*(.*)$/,
        );
        const option = line.match(/^([A-F])[.、．)]\s*(.+)$/);
        if (field) {
          active = field[1];
          fields[active] = field[2];
        } else if (option && spec.type === 'choice') {
          if (option[1] !== String.fromCharCode(65 + options.length))
            throw Error(`第 ${index + 1} 题选项请从 A 开始连续排列。`);
          options.push(option[2]);
          active = '';
        } else if (line.trim()) {
          if (!active)
            throw Error(
              `第 ${index + 1} 题请使用“题干：”“答案：”“解析：”等字段。`,
            );
          fields[active] += '\n' + line;
        }
      }
    let answer = fields['答案']?.trim() || '';
    let matching: Question['matching'];
    if (spec.type === 'choice' && /^[A-F]$/.test(answer))
      answer = options[answer.charCodeAt(0) - 65] ?? '';
    if (spec.type === 'matching') {
      const pairs = (fields['配对'] || '')
        .split('\n')
        .map((l) => l.split(/=>|→/).map((s) => s.trim()));
      if (
        pairs.length < 2 ||
        pairs.length > 8 ||
        pairs.some((p) => p.length !== 2 || p.some((v) => !v))
      )
        throw Error(`第 ${index + 1} 题需要 2–8 行“左项 => 右项”。`);
      matching = {
        left: pairs.map((p, i) => ({ id: 'L' + i, text: p[0] })),
        right: pairs.map((p, i) => ({ id: 'R' + i, text: p[1] })).reverse(),
      };
      answer = JSON.stringify(
        Object.fromEntries(pairs.map((_, i) => ['L' + i, 'R' + i])),
      );
    }
    if (!fields['题干']?.trim() || !answer)
      throw Error(`第 ${index + 1} 题缺少题干或答案。`);
    const q = questionSchema.safeParse({
      schemaVersion: 1,
      id: uid(),
      subject,
      nodeId: node.id,
      skillId: 'practice',
      type: spec.type,
      prompt: fields['题干'],
      answer,
      explanation: fields['解析'] || '请对照参考答案核对。',
      passage: fields['原文'] || undefined,
      options: spec.type === 'choice' ? options : undefined,
      matching,
      difficulty: 2,
      expectedSeconds: spec.type === 'subjective' ? 180 : 30,
      variant: preset === 'pinyin' ? 'pinyin-to-hanzi' : preset,
      source: '手动导入',
      tags: [spec.label],
      version: '1.0.0',
      rubric:
        spec.type === 'subjective'
          ? [
              {
                id: 'response',
                title: spec.skill,
                max: 5,
                description:
                  fields['评分点'] ||
                  '结合原文和参考答案检查准确性、完整性及表达。',
                skillId: 'practice',
              },
            ]
          : undefined,
    });
    if (!q.success)
      throw Error(
        `第 ${index + 1} 题字段过长或格式不正确，请检查题干、选项及答案。`,
      );
    assertQuestionFormat(q.data as Question);
    return q.data as Question;
  });
  return { node, questions };
}
