import { unzipSync, strFromU8 } from 'fflate';
import {
  EXAM_FORMAT,
  examNode,
  type ExamKind,
  type ExamPaper,
  type ExamStage,
  type ExamTask,
} from './exam-model';
import type { Node, Question } from './model';
import { questionSchema } from './importer';
import { currentNamespace, saveRecords } from './store';

export type ExamImport = {
  paper: ExamPaper;
  questions: Question[];
  nodes: Node[];
  assets: any[];
  warnings: string[];
};
const text = (v: unknown) => (typeof v === 'string' ? v : '');
export const normalizeExamName = (v: unknown): ExamKind => {
  const name = text(v)
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
  if (['TOEFL', 'TOFEL', '托福'].includes(name) || v === '托福') return 'TOEFL';
  if (name === 'SAT' || name === 'ACT') return name;
  throw new Error('请选择 TOEFL、SAT 或 ACT 试卷。');
};
const hash = async (s: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)),
    ),
    (b) => b.toString(16).padStart(2, '0'),
  )
    .join('')
    .slice(0, 24);
function safePath(path: string) {
  if (!path || path.includes('..') || /^(?:[a-z]+:|[\\/])/i.test(path))
    throw new Error('试卷包含无效的资源路径。');
  return path.replace(/\\/g, '/');
}
export async function readExamFile(file: File): Promise<ExamImport> {
  if (file.size > 30 * 1024 * 1024)
    throw new Error('试卷文件最多 30 MB，请分套导入。');
  if (!file.name.toLowerCase().endsWith('.zip'))
    return parseExamPackage(await file.text());
  let total = 0;
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter: (e) => {
      safePath(e.name.replace(/\/$/, ''));
      total += e.originalSize;
      if (total > 60 * 1024 * 1024 || e.originalSize > 25 * 1024 * 1024)
        throw new Error('解压后的试卷资源过大。');
      return !e.name.endsWith('/');
    },
  });
  if (!files['manifest.json'])
    throw new Error(
      'ZIP 根目录需要 manifest.json。请导入试卷包，而非程序源码。',
    );
  const manifest = JSON.parse(strFromU8(files['manifest.json']));
  const sections: Record<string, unknown> = {};
  for (const [id, path] of Object.entries(manifest.sections ?? {})) {
    if (typeof path !== 'string') {
      sections[id] = path;
      continue;
    }
    const bytes = files[safePath(path)];
    if (!bytes) throw new Error('缺少章节文件：' + path);
    sections[id] = JSON.parse(strFromU8(bytes));
  }
  return parseExamPackage(
    {
      ...manifest,
      sectionsInline: { ...sections, ...manifest.sectionsInline },
    },
    files,
  );
}
export async function parseExamPackage(
  input: unknown,
  files: Record<string, Uint8Array> = {},
): Promise<ExamImport> {
  let raw: any = input;
  if (typeof raw === 'string') {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    try {
      raw = JSON.parse(fenced ? fenced[1] : raw);
    } catch {
      throw new Error(
        '试卷 JSON 不完整，请复制完整内容；普通文字请使用智能识别。',
      );
    }
  }
  raw = structuredClone(raw);
  const m = raw?.manifest ?? raw;
  if (m?.schemaVersion !== undefined && m.schemaVersion !== 1)
    throw new Error('目前支持 schemaVersion: 1。');
  const exam = normalizeExamName(m?.exam);
  if (
    !text(m.title).trim() ||
    !Array.isArray(m.flow) ||
    !m.flow.length ||
    m.flow.length > 20
  )
    throw new Error('试卷需要名称和 1–20 个考试阶段。');
  const fileSignatures = await Promise.all(
    Object.entries(files).map(
      async ([name, bytes]) =>
        name +
        ':' +
        (await hash(Array.from(bytes, (b) => String.fromCharCode(b)).join(''))),
    ),
  );
  const fingerprint = await hash(
    JSON.stringify(raw) + fileSignatures.sort().join('|'),
  );
  const prefix = 'import-exam:' + fingerprint;
  if (JSON.stringify(raw).length > 3000000)
    throw Error('试卷文字超过限制，请分套导入。');
  const sections =
    raw.sectionsInline ?? raw.sections ?? m.sectionsInline ?? m.sections ?? {};
  const paper: ExamPaper = {
    id: prefix,
    kind: 'exam-paper',
    format: EXAM_FORMAT,
    exam,
    title: m.title.slice(0, 200),
    origin: 'imported',
    options: { writing: false, stages: [] },
    createdAt: new Date().toISOString(),
    status: 'ready',
    questions: {},
    passages: {},
  };
  const questions: Question[] = [],
    nodes: Node[] = [],
    assets: any[] = [],
    warnings: string[] = [];
  const ids = new Set<string>();
  for (const entry of m.flow) {
    if (
      !/^[a-zA-Z0-9_-]{1,60}$/.test(text(entry.id)) ||
      ['__proto__', 'constructor', 'prototype'].includes(entry.id) ||
      ids.has(entry.id)
    )
      throw new Error('考试阶段 ID 缺失或重复。');
    ids.add(entry.id);
    if (entry.type === 'break') {
      const previous = paper.options.stages!.at(-1);
      const seconds = Number(entry.durationSeconds ?? entry.duration);
      if (
        !previous ||
        !Number.isFinite(seconds) ||
        seconds < 0 ||
        seconds > 3600
      )
        throw new Error('休息阶段配置无效。');
      previous.breakAfter = seconds;
      continue;
    }
    if (/math|science/i.test(entry.section ?? entry.label ?? '')) {
      warnings.push('已跳过数学或科学部分：' + entry.id);
      continue;
    }
    const lower = sections[entry.id + '_easy'],
      higher = sections[entry.id + '_hard'];
    const adaptive =
      exam === 'SAT' && entry.id === 'rw2' && !!lower && !!higher;
    const section = sections[entry.id] ?? (adaptive ? lower : undefined);
    const items = Array.isArray(section)
      ? section
      : (section?.questions ?? section?.items);
    if (!Array.isArray(items) || !items.length || items.length > 120)
      throw new Error('章节 ' + entry.id + ' 缺少题目，或题量超过 120。');
    let seconds = Number(entry.durationSeconds ?? entry.duration);
    if (seconds === 0 && entry.type === 'toefl-writing') seconds = 1380;
    if (seconds === 0 && entry.type === 'toefl-speaking') seconds = 480;
    if (!Number.isInteger(seconds) || seconds <= 0 || seconds > 14400)
      throw new Error(
        '章节 ' + entry.id + ' 需要有效的 durationSeconds（秒）。',
      );
    if (entry.count !== undefined && Number(entry.count) !== items.length)
      throw new Error('章节 ' + entry.id + ' 的声明题量与实际题量不一致。');
    const stageIndex = paper.options.stages!.length;
    const stage: ExamStage = {
      id: entry.id,
      title: text(entry.label) || entry.id,
      section:
        text(entry.section) ||
        (/^toefl-/.test(entry.type ?? '')
          ? entry.type.slice(6).replace(/^./, (c: string) => c.toUpperCase())
          : text(entry.label)) ||
        entry.id,
      count: items.length,
      seconds,
      breakAfter: 0,
      adaptive,
      slots: [],
    };
    const upper = adaptive
      ? Array.isArray(higher)
        ? higher
        : higher.questions
      : [];
    if (adaptive && (!Array.isArray(upper) || upper.length !== items.length))
      throw Error('SAT 第二模块两条路线的题量必须一致。');
    const entries = adaptive
      ? [
          ...items.map((item: any, index: number) => ({
            item,
            index,
            route: 'lower',
          })),
          ...upper.map((item: any, index: number) => ({
            item,
            index,
            route: 'higher',
          })),
        ]
      : items.map((item: any, index: number) => ({
          item,
          index,
          route: 'standard',
        }));
    for (const { item, index, route } of entries) {
      const aliases: Record<string, string> = {
        email: 'write_email',
        fill_letters: 'complete_words',
        sentence_build: 'build_sentence',
        discussion: 'academic_discussion',
      };
      const taskType = aliases[text(item.type)] || text(item.type) || 'mcq';
      if (
        ![
          'mcq',
          'choice',
          'daily_life',
          'notice',
          'read_notice',
          'academic_passage',
          'listen_response',
          'conversation',
          'announcement',
          'lecture',
          'academic_talk',
          'complete_words',
          'build_sentence',
          'write_email',
          'academic_discussion',
          'listen_repeat',
          'interview',
          'essay',
          'free_response',
          'subjective',
          'blank',
          'numeric',
        ].includes(taskType)
      )
        throw Error('不支持的考试题型：' + taskType);
      if (
        exam === 'TOEFL' &&
        /Speaking/i.test(stage.section) &&
        !['listen_repeat', 'interview'].includes(taskType)
      )
        throw Error('口语部分请使用 listen_repeat 或 interview 题型。');
      if (
        exam === 'TOEFL' &&
        /Writing/i.test(stage.section) &&
        !['build_sentence', 'write_email', 'academic_discussion'].includes(
          taskType,
        )
      )
        throw Error('托福写作请使用组句、邮件或学术讨论题型。');
      const domain = (text(item.skill) || taskType).slice(0, 80);
      const slot = {
        id: `${stageIndex}-${route}-${index}`,
        stage: stageIndex,
        index,
        domain,
        type: ([
          'write_email',
          'academic_discussion',
          'listen_repeat',
          'interview',
          'essay',
          'free_response',
          'subjective',
        ].includes(taskType)
          ? 'subjective'
          : ['complete_words', 'build_sentence', 'blank', 'numeric'].includes(
                taskType,
              )
            ? 'blank'
            : 'choice') as 'choice' | 'blank' | 'subjective',
        route: route as 'standard' | 'lower' | 'higher',
      };
      const node = examNode(exam, slot, stage);
      const choices = item.choices ?? item.options;
      if (choices !== undefined && !Array.isArray(choices))
        throw Error('选项必须为数组。');
      const options = choices?.map((v: any) =>
        typeof v === 'string' ? v : text(v.text),
      );
      let answer =
        text(item.answer) ||
        (Array.isArray(item.targetWords)
          ? [text(item.answerLead), ...item.targetWords, text(item.answerTail)]
              .filter(Boolean)
              .join(' ')
          : '');
      if (!answer && Number.isInteger(item.correct) && options)
        answer = options[item.correct] ?? '';
      if (!answer && typeof item.correct === 'string')
        answer = options?.['ABCDEF'.indexOf(item.correct)] ?? item.correct;
      const task: ExamTask = {
        type: taskType,
        native: Object.fromEntries(
          Object.entries(item).filter(([k]) =>
            [
              'title',
              'noticeTitle',
              'noticeSubtitle',
              'answerLead',
              'answerTail',
              'slots',
              'questionTitle',
              'spokenPrompt',
              'dialogue',
              'professor',
              'students',
              'recipient',
              'subject',
              'instructions',
              'missingLengths',
              'blanks',
              'to',
              'professorPrompt',
              'posts',
              'highlight',
              'passageTitle',
              'speakerAssetType',
              'illustration',
            ].includes(k),
          ),
        ),
      };
      if (taskType === 'complete_words' && !item.parts) {
        const blanks =
          (text(item.passage) || text(section?.passage)).match(
            /[A-Za-z]*_+[A-Za-z]*/g,
          ) ?? [];
        const answers = answer.split('|');
        if (blanks.length !== answers.length || !blanks.length)
          throw Error(
            '补词题需要与原文空格一一对应的完整单词答案，以 | 分隔。',
          );
        item.parts = blanks.map((b: string, i: number) => ({
          visiblePrefix: b.split('_')[0],
          missingLength: answers[i].length - b.split('_')[0].length,
          answer: answers[i],
        }));
      }
      if (item.parts) {
        if (!Array.isArray(item.parts) || item.parts.length > 30)
          throw new Error('补词题的 parts 无效。');
        task.parts = item.parts.map((p: any) => {
          if (
            !Number.isInteger(p.missingLength) ||
            p.missingLength < 1 ||
            p.missingLength > 30 ||
            !text(p.answer).startsWith(text(p.visiblePrefix)) ||
            p.answer.length !== text(p.visiblePrefix).length + p.missingLength
          )
            throw new Error('补词题前缀、缺失长度与答案不一致。');
          return {
            visiblePrefix: text(p.visiblePrefix),
            missingLength: p.missingLength,
            answer: p.answer,
          };
        });
        answer = JSON.stringify(task.parts!.map((p) => p.answer));
      }
      if (item.words) {
        if (
          !Array.isArray(item.words) ||
          item.words.length > 30 ||
          item.words.some((x: any) => typeof x !== 'string')
        )
          throw new Error('组句词块无效。');
        task.words = item.words;
      }
      const audioText =
        text(item.audioText) ||
        (Array.isArray(item.dialogue)
          ? item.dialogue
              .map((d: any) => `${text(d.speaker)}: ${text(d.text)}`)
              .join('\n')
          : '');
      if (audioText) task.audioText = audioText.slice(0, 20000);
      const audioPath = text(item.audio ?? section?.audio);
      if (audioPath) {
        const bytes = files[safePath(audioPath)];
        if (!bytes || !/\.(mp3|wav|ogg|webm|m4a)$/i.test(audioPath))
          throw new Error('缺少或不支持音频资源：' + audioPath);
        const assetId = prefix + ':audio:' + assets.length;
        const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join(
          '',
        );
        const base64 = btoa(binary);
        const mime = /\.mp3$/i.test(audioPath)
          ? 'audio/mpeg'
          : /\.m4a$/i.test(audioPath)
            ? 'audio/mp4'
            : 'audio/' + audioPath.split('.').at(-1)!.toLowerCase();
        const parts: string[] = [];
        for (let offset = 0; offset < base64.length; offset += 700000) {
          const id = assetId + ':' + parts.length;
          parts.push(id);
          assets.push({
            id,
            kind: 'exam-asset-chunk',
            data: base64.slice(offset, offset + 700000),
          });
        }
        assets.push({ id: assetId, kind: 'exam-asset', mime, parts });
        task.audio = assetId;
      }
      if (
        /listen|conversation|lecture|announcement|interview/.test(taskType) &&
        !task.audio &&
        !task.audioText
      )
        throw new Error('听力或口语题需要 audio 音频或 audioText 朗读文本。');
      if (['listen_repeat', 'interview'].includes(taskType)) {
        const duration = Number(
          item.responseTime ??
            item.responseSeconds ??
            (taskType === 'listen_repeat' ? 12 : 45),
        );
        if (!Number.isInteger(duration) || duration < 1 || duration > 180)
          throw new Error('口语作答时间需在 1–180 秒之间。');
        task.responseSeconds = duration;
        answer ||= task.audioText || '请参照评分标准检查表达是否完整、清楚。';
      }
      if (
        slot.type === 'choice' &&
        (!options ||
          options.length < 2 ||
          options.length > 6 ||
          new Set(options).size !== options.length ||
          !options.includes(answer))
      )
        throw new Error(
          `第 ${stageIndex + 1} 部分第 ${index + 1} 题选项或正确答案无效。`,
        );
      if (!answer.trim() || !text(item.explanation).trim())
        throw new Error(
          `第 ${stageIndex + 1} 部分第 ${index + 1} 题缺少答案或解析。`,
        );
      const question = questionSchema.parse({
        schemaVersion: 1,
        id: prefix + ':q:' + slot.id,
        nodeId: node.id,
        skillId: 'apply',
        subject: 'ce',
        type: slot.type,
        prompt:
          text(item.prompt) || text(item.instruction) || 'Complete the task.',
        passage: text(item.passage) || text(section?.passage) || undefined,
        options,
        answer,
        explanation: item.explanation,
        difficulty: item.difficulty ?? 3,
        expectedSeconds:
          task.responseSeconds ??
          Math.min(3600, Math.max(1, Math.round(seconds / items.length))),
        variant: prefix + ':' + slot.id,
        source: paper.title,
        tags: ['exam-only', 'imported', exam.toLowerCase()],
        version: '1',
        rubric:
          slot.type === 'subjective'
            ? (item.rubric ?? [
                {
                  id: 'response',
                  title: 'Task response',
                  max: 5,
                  description:
                    'Accuracy, completeness, coherence and language control.',
                  skillId: 'apply',
                },
              ])
            : undefined,
        verified: false,
      }) as Question;
      question.examTask = task;
      questions.push(question);
      nodes.push(node);
      stage.slots.push(slot);
      paper.questions[slot.id] = question.id;
    }
    paper.options.stages!.push(stage);
  }
  if (!questions.length || questions.length > 400)
    throw new Error('英语试卷需要 1–400 道题。');
  paper.options.writing =
    exam === 'ACT' &&
    paper.options.stages!.some((s) => /writing/i.test(s.section));
  if (exam === 'SAT' && !paper.options.stages!.some((s) => s.adaptive))
    warnings.push(
      '导入试卷按所提供模块顺序作答；未提供分流题池时不模拟难度分流。',
    );
  if (exam === 'TOEFL')
    warnings.push(
      '按导入题量和时间模拟；不换算官方分数。口语录音在交卷后对照参考答案自评。',
    );
  if (questions.some((q) => q.examTask?.audioText && !q.examTask.audio))
    warnings.push(
      '部分题目仅含朗读文本，将使用设备语音合成，不等同正式考试录音。',
    );
  return {
    paper,
    questions,
    nodes: [...new Map(nodes.map((n) => [n.id, n])).values()],
    assets,
    warnings,
  };
}
export async function installExamImport(
  value: ExamImport,
  ns = currentNamespace(),
) {
  if (currentNamespace() !== ns) throw new Error('账户已切换，请重新导入。');
  const now = new Date().toISOString();
  const records = [
    ...value.nodes.map((payload) => ({ kind: 'node' as const, payload })),
    ...value.questions.map((payload) => ({
      kind: 'question' as const,
      payload,
    })),
    ...value.assets.map((payload) => ({ kind: 'job' as const, payload })),
    { kind: 'job' as const, payload: value.paper },
  ];
  await saveRecords(
    records.map((r) => ({
      ...r,
      id: r.payload.id,
      updated_at: now,
      deleted: false,
    })),
    true,
    ns,
  );
}

export function smartExamText(source: string, exam: ExamKind) {
  if (source.trim().startsWith('{') || source.includes('```json'))
    return parseExamPackage(source);
  const blocks = source.trim().split(/\n(?=\s*\d+[.、)]\s*)/);
  const items = blocks.map((block) => {
    const lines = block.split(/\r?\n/);
    const choices = lines
      .filter((l) => /^[A-F][.、)]\s*/.test(l))
      .map((l) => l.replace(/^[A-F][.、)]\s*/, ''));
    const answer = lines
      .find((l) => /^(答案|Answer)\s*[:：]/i.test(l))
      ?.replace(/^(答案|Answer)\s*[:：]\s*/i, '')
      .trim();
    const explanation = lines
      .find((l) => /^(解析|Explanation)\s*[:：]/i.test(l))
      ?.replace(/^(解析|Explanation)\s*[:：]\s*/i, '');
    return {
      type: 'mcq',
      prompt: lines
        .filter(
          (l) => !/^(?:[A-F][.、)]|答案|Answer|解析|Explanation)/i.test(l),
        )
        .join('\n')
        .replace(/^\d+[.、)]\s*/, ''),
      choices,
      correct: answer,
      explanation,
    };
  });
  return parseExamPackage({
    schemaVersion: 1,
    exam,
    title: exam + ' 导入练习',
    flow: [
      {
        id: 'import',
        label: 'Reading',
        durationSeconds: Math.max(60, items.length * 90),
      },
    ],
    sectionsInline: { import: { questions: items } },
  });
}
