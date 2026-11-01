import type { Pack, Question, Node, Subject, StudyData } from './model';
import { uid } from './model';
import { validatePack } from './importer';
import { content, stable } from './pack-versions';
export type PackDraft = {
  id: string;
  pack: Pack;
  revision?: string;
  savedAt?: string;
};
export function blankPack(subject: Subject): Pack {
  return {
    schemaVersion: 1,
    manifest: {
      id: 'pack:' + uid(),
      title: '',
      version: '1.0.0',
      subject,
      description: '',
      changelog: '',
      compatibility: 'Reviewbox 2.x',
    },
    knowledge: [],
    questions: [],
  };
}
export function blankNode(subject: Subject): Node {
  const id = 'node:' + uid();
  return {
    id,
    subject,
    course: '',
    unit: '',
    chapter: '',
    title: '',
    description: '',
    prerequisites: [],
    relatedNodes: [],
    importance: 0.5,
    examWeight: 0.5,
    skills: [{ id: id + ':skill', title: '基础理解', difficulty: 2 }],
    source: '用户编写',
    version: '1',
  };
}
export function blankQuestion(node: Node, type = 'choice'): Question {
  return {
    schemaVersion: 1,
    id: 'question:' + uid(),
    nodeId: node.id,
    skillId: node.skills[0].id,
    subject: node.subject,
    type,
    prompt: '',
    answer: '',
    explanation: '',
    difficulty: 2,
    expectedSeconds: 60,
    variant: '',
    source: '用户编写',
    tags: [],
    version: '1',
    ...(type === 'choice' ? { options: ['', ''] } : {}),
    ...(type === 'matching'
      ? {
          matching: {
            left: [
              { id: 'left:' + uid(), text: '' },
              { id: 'left:' + uid(), text: '' },
            ],
            right: [
              { id: 'right:' + uid(), text: '' },
              { id: 'right:' + uid(), text: '' },
            ],
          },
          answer: '{}',
        }
      : {}),
  };
}
export function packFromInstalled(
  data: StudyData,
  id: string,
  source?: Pack,
): Pack {
  const installed = data.packs.find((p) => p.id === id);
  if (!installed) throw Error('学习包已不可用，请刷新');
  if (!installed.nodeIds || !installed.questionIds)
    throw Error('此旧包缺少精确内容清单，请先重新导入后再编辑');
  const nodes = installed.nodeIds.map((x) =>
      data.nodes.find((n) => n.id === x),
    ),
    questions = installed.questionIds.map((x) =>
      data.questions.find((q) => q.id === x),
    );
  if (nodes.some((n) => !n) || questions.some((q) => !q))
    throw Error('部分内容尚未同步完整，请先同步');
  const parts = installed.version.split('.');
  parts[parts.length - 1] = String((Number(parts[parts.length - 1]) || 0) + 1);
  return structuredClone({
    ...(source ?? {}),
    schemaVersion: 1,
    manifest: { ...installed, version: parts.join('.'), changelog: '' },
    knowledge: nodes,
    questions,
  }) as Pack;
}
export function changeQuestion(
  pack: Pack,
  id: string,
  patch: Partial<Question>,
): Pack {
  return {
    ...pack,
    questions: pack.questions.map((q) => {
      if (q.id !== id) return q;
      const next = { ...q, ...patch };
      if (stable(content(q)) === stable(content(next))) return next;
      return {
        ...next,
        verified: false,
        verification: undefined,
        version: String((Number(q.version) || 0) + 1),
        ...('diagram' in patch || 'prompt' in patch || 'passage' in patch
          ? { diagramChoice: undefined }
          : {}),
      };
    }),
  };
}
export function readyStudioPack(pack: Pack) {
  if (!pack.manifest.title.trim()) throw Error('请先填写学习包名称');
  if (!pack.questions.length) throw Error('至少添加一道完整题目');
  if (pack.knowledge.some((n) => !n.title.trim()))
    throw Error('请填写知识点名称');
  return validatePack(pack);
}
export function moveItem<T>(items: T[], from: number, to: number) {
  if (from < 0 || to < 0 || from >= items.length || to >= items.length)
    return items;
  const next = items.slice(),
    [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
