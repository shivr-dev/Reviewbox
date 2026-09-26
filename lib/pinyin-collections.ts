import type { Node, Question, QueueItem } from './model';
import { isPinyin } from './question-tools';

export function pinyinCollectionKey(question: Question) {
  return question.collectionId ?? `legacy:${question.nodeId}`;
}

export function questionTopicTitle(question: Question, node?: Node) {
  return isPinyin(question)
    ? question.collectionTitle || node?.chapter || '看拼音写汉字'
    : node?.title || '知识点';
}

export function pinyinCollections(questions: Question[], nodes: Node[]) {
  const names = new Map(nodes.map((node) => [node.id, node.title]));
  const collections = new Map<string, { id: string; title: string; count: number }>();
  for (const question of questions) {
    if (question.subject !== 'chinese' || !isPinyin(question)) continue;
    const id = pinyinCollectionKey(question);
    const entry = collections.get(id);
    if (entry) entry.count += 1;
    else collections.set(id, {
      id,
      title: question.collectionTitle || names.get(question.nodeId) || '未命名字词篇目',
      count: 1,
    });
  }
  return [...collections.values()];
}

export function pinyinPracticeQueue(questions: Question[], collectionId = 'all'): QueueItem[] {
  return questions
    .filter((question) => question.subject === 'chinese' && isPinyin(question) &&
      (collectionId === 'all' || pinyinCollectionKey(question) === collectionId))
    .map((question) => ({ question, reason: '篇目字词', priority: 1 }));
}
