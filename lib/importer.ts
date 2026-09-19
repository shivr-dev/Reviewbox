import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';
import { z } from 'zod';
import {
  SUBJECTS,
  uid,
  type Subject,
  type Node,
  type Question,
  type Pack,
} from './model';
import { assertQuestionFormat } from './question-tools';
const subjects = SUBJECTS.map((x) => x.id);
const safeText = z.string().max(100000);
const skillSchema = z.object({
  id: z.string().min(1).max(160),
  title: z.string().min(1).max(200),
  difficulty: z.number().int().min(1).max(5),
});
export const nodeSchema = z.object({
  id: z.string().min(1).max(160),
  subject: z.enum([
    'chinese',
    'math',
    'english',
    'ce',
    'physics',
    'chemistry',
    'history',
    'biology',
  ]),
  course: safeText,
  unit: safeText,
  chapter: safeText,
  title: z.string().min(1).max(300),
  description: safeText,
  prerequisites: z.array(z.string()).max(50).default([]),
  relatedNodes: z.array(z.string()).max(50).default([]),
  importance: z.number().min(0).max(1),
  examWeight: z.number().min(0).max(1),
  skills: z.array(skillSchema).min(1).max(30),
  source: safeText,
  version: z.string().max(50),
  tags: z.array(z.string()).optional(),
});
export const questionSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1).max(160),
  nodeId: z.string().min(1).max(160),
  skillId: z.string().min(1).max(160),
  subject: z.enum([
    'chinese',
    'math',
    'english',
    'ce',
    'physics',
    'chemistry',
    'history',
    'biology',
  ]),
  type: z.string().max(60),
  prompt: z.string().min(1).max(12000),
  answer: z.string().min(1).max(12000),
  explanation: safeText,
  difficulty: z.number().int().min(1).max(5),
  expectedSeconds: z.number().min(1).max(3600),
  variant: z.string().max(200),
  options: z.array(z.string().max(3000)).max(6).optional(),
  acceptedAnswers: z.array(z.string().max(3000)).max(20).optional(),
  matching: z
    .object({
      left: z
        .array(z.object({ id: z.string().max(30), text: z.string().max(1000) }))
        .min(2)
        .max(8),
      right: z
        .array(z.object({ id: z.string().max(30), text: z.string().max(1000) }))
        .min(2)
        .max(8),
    })
    .optional(),
  transferFrom: z.string().max(160).optional(),
  passage: z.string().max(30000).optional(),
  rubric: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        max: z.number().positive().max(100),
        description: z.string().max(3000),
        skillId: z.string(),
      }),
    )
    .max(20)
    .optional(),
  solution: z.array(z.string().max(4000)).max(12).optional(),
  diagram: z.any().optional(),
  source: safeText,
  tags: z.array(z.string()).max(30),
  version: z.string().max(50),
  verified: z.boolean().optional(),
  verification: z.any().optional(),
  expiresAt: z.string().optional(),
});
export function validatePack(value: any): Pack {
  if (value?.schemaVersion !== 1)
    throw new Error('学习包需要 schemaVersion: 1');
  if (
    !value.manifest?.id ||
    !value.manifest?.version ||
    !Array.isArray(value.knowledge) ||
    !Array.isArray(value.questions) ||
    value.knowledge.length > 5000 ||
    value.questions.length > 15000
  )
    throw new Error('学习包缺少清单、知识或题目，或超过导入上限');
  const knowledge = value.knowledge.map((x: any) => nodeSchema.parse(x));
  const ids = new Map<string, Node>(knowledge.map((n: Node) => [n.id, n]));
  if (ids.size !== knowledge.length) throw new Error('知识点 ID 重复');
  const seen = new Set();
  const questions = value.questions.map((x: any) => {
    const q = questionSchema.parse(x);
    const n = ids.get(q.nodeId);
    if (
      !n ||
      n.subject !== q.subject ||
      !n.skills.some((s) => s.id === q.skillId) ||
      seen.has(q.id)
    )
      throw new Error('题目引用了不存在的知识点或能力，或 ID 重复');
    assertQuestionFormat(q as Question);
    seen.add(q.id);
    return { ...q, verified: false, verification: undefined };
  });
  return {
    schemaVersion: 1,
    manifest: {
      id: String(value.manifest.id).slice(0, 160),
      title: String(value.manifest.title ?? '导入学习包').slice(0, 300),
      version: String(value.manifest.version),
      subject: String(value.manifest.subject ?? 'all'),
      description: String(value.manifest.description ?? ''),
      changelog: String(value.manifest.changelog ?? ''),
      compatibility: String(value.manifest.compatibility ?? 'Review 1.x'),
    },
    knowledge,
    questions,
  };
}
export function guessSubject(text: string): Subject {
  if (/SAT|ACT|punctuation|verb agreement|sentence boundar/i.test(text))
    return 'ce';
  if (/生物|细胞|光合作用|呼吸作用|生态系统|遗传|染色体|食物链/.test(text))
    return 'biology';
  if (/化学|化合价|化学式|方程式|CO₂|H₂O|原子/.test(text)) return 'chemistry';
  if (/物理|速度|浮力|光路|压强|机械|透镜/.test(text)) return 'physics';
  if (/函数|方程|三角形|勾股|几何|抛物线/.test(text)) return 'math';
  if (/革命|朝代|历史|世纪|运动的影响/.test(text)) return 'history';
  if (
    /suspense|writing|symbolism|literary|imagery/i.test(text) ||
    text.replace(/[^A-Za-z]/g, '').length > text.length * 0.5
  )
    return 'english';
  return 'chinese';
}
export function smartParse(
  text: string,
  subject?: Subject,
): { nodes: Node[]; questions: Question[] } {
  const chosen = subject ?? guessSubject(text);
  const source = '我的资料';
  const paragraphs = text
    .trim()
    .split(
      /\n\s*\n|\n(?=[^\n]{1,100}(?:[:：\t]|[a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]))/,
    )
    .filter((x) => x.trim())
    .slice(0, 120);
  const chunks =
    paragraphs.length > 1
      ? paragraphs
      : text
          .split('\n')
          .filter((x) => x.trim())
          .slice(0, 120);
  const nodes: Node[] = [],
    questions: Question[] = [];
  for (const chunk of chunks) {
    const line = chunk.trim();
    if (line.length < 2) continue;
    const pinyin = line.match(
      /^([\u3400-\u9fff]{1,12})\s+([a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü\s]+)$/i,
    );
    const pair = line.match(/^(.{1,90}?)[：:\t]\s*([\s\S]+)$/);
    const title = (pinyin?.[1] ?? pair?.[1] ?? line.slice(0, 40)).trim();
    const answer = (pinyin?.[1] ?? pair?.[2] ?? line).trim();
    const n: Node = {
      id: uid(),
      subject: chosen,
      course: '我的课程',
      unit: '导入资料',
      chapter: '待整理',
      title,
      description: line.slice(0, 100000),
      prerequisites: [],
      relatedNodes: [],
      importance: 0.7,
      examWeight: 0.7,
      skills: [
        {
          id: 'recall',
          title: pinyin ? '字形记忆' : '内容回忆',
          difficulty: 1,
        },
      ],
      source,
      version: '1.0.0',
    };
    nodes.push(n);
    questions.push({
      schemaVersion: 1,
      id: uid(),
      nodeId: n.id,
      skillId: 'recall',
      subject: chosen,
      type: 'recall',
      prompt: pinyin
        ? `根据拼音回忆字形：${pinyin[2]}`
        : `根据资料，回忆「${title}」的内容。`,
      answer,
      explanation: line,
      difficulty: 1,
      expectedSeconds: 25,
      ...(pinyin ? { type: 'pinyin' } : {}),
      variant: pinyin ? 'pinyin-to-hanzi' : 'material-recall',
      source,
      tags: ['导入'],
      version: '1.0.0',
    });
  }
  return { nodes, questions };
}
export function download(
  name: string,
  data: unknown,
  mime = 'application/json',
) {
  const blob =
    data instanceof Blob
      ? data
      : new Blob(
          [typeof data === 'string' ? data : JSON.stringify(data, null, 2)],
          { type: mime },
        );
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function downloadPack(pack: Pack) {
  const files = {
    'manifest.json': strToU8(
      JSON.stringify({ schemaVersion: 1, ...pack.manifest }, null, 2),
    ),
    'knowledge.json': strToU8(JSON.stringify(pack.knowledge)),
    'questions.json': strToU8(JSON.stringify(pack.questions)),
    'keyterms.json': strToU8(JSON.stringify(pack.keyterms ?? [])),
    'rubrics.json': strToU8(JSON.stringify(pack.rubrics ?? [])),
    'assets/README.txt': strToU8(
      'Knowledge content is separate from personal mastery and answer history.',
    ),
  };
  const zipped = zipSync(files);
  download(
    `${pack.manifest.id}-${pack.manifest.version}.zip`,
    new Blob([zipped as BlobPart], { type: 'application/zip' }),
  );
}
export async function extractFile(
  file: File,
): Promise<{ text?: string; pack?: Pack; backup?: any }> {
  if (file.size > 15 * 1024 * 1024) throw new Error('请导入 15 MB 以内的文件');
  const ext = file.name.split('.').at(-1)?.toLowerCase();
  if (ext === 'json') {
    const v = JSON.parse(await file.text());
    return v.records ? { backup: v } : { pack: validatePack(v) };
  }
  if (['txt', 'csv', 'tsv', 'md'].includes(ext ?? ''))
    return { text: await file.text() };
  if (['zip', 'docx', 'pptx'].includes(ext ?? '')) {
    let total = 0;
    const zip = unzipSync(new Uint8Array(await file.arrayBuffer()), {
      filter(entry) {
        total += entry.originalSize;
        if (total > 30 * 1024 * 1024 || entry.originalSize > 10 * 1024 * 1024)
          throw new Error('解压后文件过大');
        return !entry.name.startsWith('/') && !entry.name.includes('..');
      },
    });
    if (ext === 'zip') {
      const parse = (name: string) =>
        JSON.parse(strFromU8(zip[name] ?? new Uint8Array()));
      const manifest = parse('manifest.json');
      return {
        pack: validatePack({
          schemaVersion: manifest.schemaVersion,
          manifest,
          knowledge: parse('knowledge.json'),
          questions: parse('questions.json'),
        }),
      };
    }
    const names = Object.keys(zip)
      .filter((n) =>
        ext === 'docx'
          ? n === 'word/document.xml'
          : /^ppt\/slides\/slide\d+\.xml$/.test(n),
      )
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const text = names
      .map((n) => {
        const xml = new DOMParser().parseFromString(
          strFromU8(zip[n]),
          'text/xml',
        );
        return Array.from(xml.getElementsByTagNameNS('*', 'p'))
          .map((p) =>
            Array.from(p.getElementsByTagNameNS('*', 't'))
              .map((t) => t.textContent)
              .join(''),
          )
          .join('\n');
      })
      .join('\n\n');
    return { text };
  }
  if (ext === 'xlsx' || ext === 'xls') {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await file.arrayBuffer(), {
      type: 'array',
      dense: true,
      sheetRows: 1000,
      cellFormula: false,
    });
    return {
      text: wb.SheetNames.slice(0, 10)
        .map((name) => name + '\n' + XLSX.utils.sheet_to_csv(wb.Sheets[name]))
        .join('\n\n'),
    };
  }
  if (ext === 'pdf') {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdf.worker.min.mjs',
      document.baseURI,
    ).href;
    const pdf = await pdfjs.getDocument({
      data: await file.arrayBuffer(),
      isEvalSupported: false,
    }).promise;
    let text = '';
    for (let i = 1; i <= Math.min(pdf.numPages, 80); i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((x: any) => x.str ?? '').join(' ') + '\n\n';
    }
    await pdf.destroy();
    if (text.trim().length < 10)
      throw new Error('这是扫描版 PDF，请先做文字识别或导入页面图片');
    return { text };
  }
  if (file.type.startsWith('image/')) {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('chi_sim+eng');
    try {
      const result = await worker.recognize(file);
      return {
        text: result.data.text.replace(
          /(?<=[\u3400-\u9fff])[^\S\r\n]+(?=[\u3400-\u9fff])/g,
          '',
        ),
      };
    } finally {
      await worker.terminate();
    }
  }
  throw new Error(
    '支持 PDF、DOCX、PPTX、图片、文本、JSON、CSV、Excel。旧版 PPT 请另存为 PPTX。',
  );
}
