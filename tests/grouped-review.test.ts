import test from 'node:test';
import assert from 'node:assert/strict';
import { blankPack, blankNode, blankQuestion } from '../lib/pack-studio';
import {
  groupedPackReview,
  confirmReviewGroup,
  diagramSignature,
} from '../lib/grouped-pack-review';
function base() {
  const p = blankPack('math'),
    n = blankNode('math');
  n.title = '正式内容';
  p.knowledge = [n];
  p.manifest.title = '正式内容';
  const q = blankQuestion(n);
  q.prompt = '观察图形';
  q.options = ['甲', '乙'];
  q.answer = '甲';
  q.diagram = {
    type: 'semantic',
    kind: 'geometry',
    points: [
      { id: 'A', x: 0, y: 0 },
      { id: 'B', x: 2, y: 0 },
    ],
    segments: [['A', 'B']],
  };
  p.questions = [q];
  return p;
}
test('review groups expose real errors, engine checks, original choices and visual-only work', () => {
  const p = base(),
    q = p.questions[0];
  assert.equal(groupedPackReview(p)[0].group, 'visual');
  assert.equal(
    groupedPackReview({ ...p, questions: [{ ...q, nodeId: 'missing' }] })[0]
      .group,
    'errors',
  );
  assert.equal(
    groupedPackReview({
      ...p,
      questions: [
        {
          ...q,
          media: [
            { id: 'image', src: 'data:image/png;base64,AAAA', alt: '原图' },
          ],
        },
      ],
    })[0].group,
    'manual',
  );
  const chemistry = {
    ...q,
    diagram: {
      type: 'semantic' as const,
      kind: 'chemistry' as const,
      view: 'structure2d' as const,
      format: 'smiles' as const,
      data: 'CCO',
      moleculeIndex: 0,
      style: 'ball-stick' as const,
      showProperties: false,
      propertiesPhase: 'solution' as const,
      source: { citation: 'PubChem CID 702' },
    },
  };
  assert.equal(
    groupedPackReview({ ...p, questions: [chemistry] })[0].group,
    'engine',
  );
  assert.throws(
    () => confirmReviewGroup({ ...p, questions: [chemistry] }, [q.id]),
    /引擎/,
  );
  const checks = {
    [q.id]: {
      signature: diagramSignature(chemistry),
      status: 'passed' as const,
    },
  };
  assert.equal(
    groupedPackReview({ ...p, questions: [chemistry] }, checks)[0].group,
    'visual',
  );
  assert.equal(
    groupedPackReview(
      {
        ...p,
        questions: [
          { ...chemistry, diagram: { ...chemistry.diagram, data: 'O' } },
        ],
      },
      checks,
    )[0].group,
    'engine',
  );
});
test('batch approval never overrides errors, invents verification or mutates the source pack', () => {
  const p = base(),
    id = p.questions[0].id,
    next = confirmReviewGroup(p, [id]);
  assert.equal(next.questions[0].diagramChoice, 'redraw');
  assert.notEqual(next.questions[0].verified, true);
  assert.equal(p.questions[0].diagramChoice, undefined);
  assert.equal(groupedPackReview(next)[0].group, 'ready');
  assert.throws(
    () =>
      confirmReviewGroup(
        { ...p, questions: [{ ...p.questions[0], nodeId: 'invalid' }] },
        [id],
      ),
    /不能批量跳过/,
  );
});
test('bulk original selection requires an actual choice and preserves image data', () => {
  const p = base(),
    q = p.questions[0];
  q.media = [
    { id: 'original', src: 'data:image/png;base64,AAAA', alt: '原题图' },
  ];
  const next = confirmReviewGroup(p, [q.id], {}, 'original');
  assert.equal(next.questions[0].diagramChoice, 'original');
  assert.deepEqual(next.questions[0].media, q.media);
  assert.equal(groupedPackReview(next)[0].group, 'ready');
});
