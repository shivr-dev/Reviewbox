import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {
  blankPack,
  blankNode,
  blankQuestion,
  changeQuestion,
  readyStudioPack,
  moveItem,
} from '../lib/pack-studio';
import { saveStudioDraft, studioDrafts } from '../lib/studio-store';
import { currentNamespace, allRecords } from '../lib/store';
import {
  paginateBlocks,
  validatePublishingLayout,
} from '../lib/exam-publishing';
import { Packer } from 'docx';
import { bookletDocument } from '../lib/export-docx';
import { unzipSync, strFromU8 } from 'fflate';
function pack() {
  const p = blankPack('math'),
    n = blankNode('math');
  n.title = '用户知识点';
  p.manifest.title = '用户草稿';
  p.knowledge = [n];
  const q = blankQuestion(n);
  q.prompt = '选择数值';
  q.options = ['1', '2'];
  q.answer = '1';
  q.explanation = '说明';
  p.questions = [q];
  return p;
}
test('studio edits preserve stable identities and invalidate evidence without changing live records', () => {
  const p = pack(),
    q = p.questions[0];
  q.verified = true;
  q.verification = {
    method: 'manual',
    solverCount: 1,
    at: new Date().toISOString(),
  };
  const next = changeQuestion(p, q.id, { prompt: '修订题干' });
  assert.equal(next.questions[0].id, q.id);
  assert.equal(next.manifest.id, p.manifest.id);
  assert.equal(next.questions[0].verified, false);
  assert.equal(p.questions[0].verified, true);
  assert.equal(readyStudioPack(next).questions[0].prompt, '修订题干');
});
test('draft chunks round trip and concurrent stale edits cannot overwrite a newer revision', async () => {
  const draft = { id: 'test-studio:' + crypto.randomUUID(), pack: pack() },
    ns = currentNamespace();
  draft.pack.manifest.description = '长文本'.repeat(10000);
  const revision = await saveStudioDraft(draft, ns),
    restored = (await studioDrafts(ns)).find((d) => d.id === draft.id)!;
  assert.deepEqual(restored.pack, draft.pack);
  assert.equal(restored.revision, revision);
  await assert.rejects(
    saveStudioDraft({ ...draft, revision: 'stale' }, ns),
    /其他窗口/,
  );
  const records = await allRecords(ns);
  assert.equal(records.filter((r) => r.kind === 'question').length, 0);
  assert.ok(
    records
      .filter((r) => r.payload.kind === 'pack-studio-part' && !r.deleted)
      .every(
        (r) =>
          new TextEncoder().encode(JSON.stringify(r.payload)).length < 30000,
      ),
  );
  await assert.rejects(
    saveStudioDraft({ ...draft, revision }, 'different-account'),
    /账户/,
  );
});
test('publication pagination handles measured heights and explicit page breaks; order stays by question IDs', () => {
  assert.deepEqual(
    paginateBlocks(
      [
        { id: 'a', height: 400 },
        { id: 'b', height: 400 },
        { id: 'c', height: 100 },
      ],
      850,
      100,
    ),
    [['a'], ['b', 'c']],
  );
  assert.deepEqual(moveItem(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b']);
  assert.throws(
    () =>
      validatePublishingLayout(['a', 'b'], {
        header: '',
        showPageNumbers: true,
        pageQuestionIds: [['a', 'a']],
        questions: {},
      }),
    /分页/,
  );
});
test('DOCX export applies author-selected order, header, page breaks, blank lines and numbering preference', async () => {
  const p = pack(),
    a = p.questions[0],
    b = { ...a, id: a.id + 'b', prompt: 'SECOND_MARKER' };
  a.prompt = 'FIRST_MARKER';
  const blob = await Packer.toBuffer(
    bookletDocument([a, b], {
      title: '排版文档',
      kind: 'exam',
      answerLines: 0,
      groupBy: 'none',
      images: {},
      publishing: {
        header: 'CUSTOM_HEADER',
        showPageNumbers: false,
        pageQuestionIds: [[b.id], [a.id]],
        questions: {
          [a.id]: { imageWidth: 60, answerLines: 2, breakBefore: true },
          [b.id]: { imageWidth: 80, answerLines: 0, breakBefore: false },
        },
      },
    }),
  );
  const files = unzipSync(blob),
    document = strFromU8(files['word/document.xml']);
  assert.ok(
    document.indexOf('SECOND_MARKER') < document.indexOf('FIRST_MARKER'),
  );
  assert.match(document, /pageBreakBefore/);
  assert.match(strFromU8(files['word/header1.xml']), /CUSTOM_HEADER/);
  assert.doesNotMatch(
    strFromU8(files['word/footer1.xml']),
    /instrText[^>]*>PAGE/,
  );
});
