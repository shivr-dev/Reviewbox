'use client';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { generateVerified, resumeVerifiedJob } from '@/lib/ai-client';
import { validatePack } from '@/lib/importer';
import { inspectPackContent } from '@/lib/import-review';
import { installPack, currentNamespace, loadData } from '@/lib/store';
import { naviContentVersion } from '@/lib/navi-context';
import type { Question, Pack, Node } from '@/lib/model';
import { useReview } from './review-context';
import MathText from './math-text';
import QuestionVisual from './question-visual';
const PackContentReview = lazy(() => import('./pack-content-review'));
function nodeClosure(nodes: Node[], id: string) {
  const selected = new Map<string, Node>(),
    visit = (key: string) => {
      if (selected.has(key)) return;
      const node = nodes.find((n) => n.id === key);
      if (!node) return;
      selected.set(key, node);
      if (selected.size > 100) throw new Error('Too many prerequisite nodes');
      for (const key of [
        ...node.prerequisites,
        ...node.relatedNodes,
        ...(node.dependencies ?? []).map((d) => d.nodeId),
      ])
        visit(key);
    };
  visit(id);
  return [...selected.values()];
}
const fingerprint = (q: Question) =>
  naviContentVersion({ ...q, verified: undefined, verification: undefined });
export default function NaviPracticePreview({
  question: q,
  threadId,
  sourcePack,
  onClose,
}: {
  question: Question;
  threadId: string;
  sourcePack?: Pack;
  onClose: () => void;
}) {
  const { t } = useTranslation('study'),
    { data, refresh, aiReady } = useReview(),
    owner = useRef(currentNamespace()),
    gate = useRef(false),
    alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  const [stage, setStage] = useState<
      'confirm' | 'generating' | 'preview' | 'saved'
    >('confirm'),
    [question, setQuestion] = useState<Question>(),
    [checked, setChecked] = useState(''),
    [error, setError] = useState(''),
    [saving, setSaving] = useState(false),
    [destination, setDestination] = useState('new'),
    [title, setTitle] = useState(t('navi.practice.defaultTitle')),
    [repair, setRepair] = useState(''),
    [pending, setPending] = useState(false),
    [review, setReview] = useState(false);
  const sourceNodes = sourcePack?.knowledge ?? data.nodes,
    node = sourceNodes.find((n) => n.id === q.nodeId),
    skill = node?.skills.find((s) => s.id === q.skillId),
    destinations = data.packs.filter((p) => p.id.startsWith('navi-practice:'));
  const closure = useMemo(() => {
      try {
        return {
          knowledge: node ? nodeClosure(sourceNodes, node.id) : [],
          ok: !!node,
        };
      } catch {
        return { knowledge: [], ok: false };
      }
    }, [node?.id, sourcePack, data.nodes]),
    knowledge = closure.knowledge;
  const previewPack: Pack | undefined =
    question && node
      ? {
          schemaVersion: 1,
          manifest: {
            id: 'navi-preview',
            title: title || t('navi.practice.defaultTitle'),
            version: '1.0.0',
            subject: node.subject,
            description: '',
            changelog: '',
            compatibility: 'Reviewbox 2.1',
          },
          knowledge,
          questions: [question],
        }
      : undefined;
  const report = previewPack ? inspectPackContent(previewPack) : undefined,
    verified = !!question?.verified && checked === fingerprint(question),
    blocked = !!report?.blocked.length || pending || !verified;
  function close() {
    alive.current = false;
    onClose();
  }
  function acceptQuestion(ready: Question) {
    if (alive.current && currentNamespace() === owner.current) {
      setQuestion(ready);
      setChecked(fingerprint(ready));
      setStage('preview');
    }
  }
  async function generate() {
    if (
      gate.current ||
      !closure.ok ||
      !node ||
      !skill ||
      currentNamespace() !== owner.current
    )
      return;
    gate.current = true;
    setStage('generating');
    setError('');
    try {
      const ready = await generateVerified(
        node,
        skill,
        q.difficulty,
        'Navi analogous practice: fresh conditions, same concept. ' +
          repair.slice(0, 1000),
        report?.blocked
          .map((r) =>
            JSON.stringify({
              scoring: r.scoring,
              diagram: r.diagram,
              science: r.science,
            }),
          )
          .slice(0, 4) ?? [],
        () => {},
        { transferFrom: q, previewOnly: true },
      );
      acceptQuestion(ready);
    } catch (e) {
      if (alive.current && currentNamespace() === owner.current) {
        setError(e instanceof Error ? e.message : t('navi.error.request'));
        setStage(question ? 'preview' : 'confirm');
      }
    } finally {
      gate.current = false;
    }
  }
  async function reverify() {
    if (gate.current || !previewPack || !question || !node || !skill) return;
    gate.current = true;
    setStage('generating');
    setError('');
    try {
      const parsed = validatePack(previewPack),
        candidate = parsed.questions[0];
      const ready = await resumeVerifiedJob(
        {
          id: 'job:' + crypto.randomUUID(),
          kind: 'generation',
          previewOnly: true,
          node,
          skill,
          difficulty: q.difficulty,
          style: 'Navi edited exercise verification',
          previousErrors: [],
          status: 'validating',
          createdAt: new Date().toISOString(),
          question: candidate,
          solvers: [],
          attempt: 0,
          transferFrom: q,
        },
        () => {},
      );
      acceptQuestion(ready);
    } catch (e) {
      if (alive.current && currentNamespace() === owner.current) {
        setError(e instanceof Error ? e.message : t('navi.error.request'));
        setStage('preview');
      }
    } finally {
      gate.current = false;
    }
  }
  function edit(pack: Pack) {
    const edited = pack.questions[0];
    if (!edited) return;
    setQuestion({ ...edited, verified: false, verification: undefined });
    setChecked('');
  }
  async function save() {
    if (
      !question ||
      !node ||
      gate.current ||
      blocked ||
      currentNamespace() !== owner.current
    )
      return;
    gate.current = true;
    setSaving(true);
    setError('');
    try {
      const latest = await loadData(owner.current),
        existing =
          destination === 'new'
            ? undefined
            : latest.packs.find(
                (p) =>
                  p.id === destination && p.id.startsWith('navi-practice:'),
              );
      if (destination !== 'new' && !existing)
        throw new Error(t('navi.error.context'));
      const manifest: Pack['manifest'] = existing
        ? {
            ...existing,
            version:
              String(Number(existing.version.split('.')[0]) + 1) + '.0.0',
            changelog: 'Navi verified practice',
          }
        : {
            id: 'navi-practice:' + crypto.randomUUID(),
            title: title.trim() || t('navi.practice.defaultTitle'),
            version: '1.0.0',
            subject: node.subject,
            description: 'Personal Navi practice',
            changelog: '',
            compatibility: 'Reviewbox 2.1',
          };
      const current = latest.questions.filter((q) =>
          existing?.questionIds?.includes(q.id),
        ),
        nodes = [
          ...new Map(
            [
              ...knowledge,
              ...latest.nodes.filter((n) => existing?.nodeIds?.includes(n.id)),
            ].map((n) => [n.id, n]),
          ).values(),
        ];
      const origin = sourcePack
        ? ' · ' + sourcePack.manifest.id + ' @ ' + sourcePack.manifest.version
        : '';
      const pack = validatePack({
        schemaVersion: 1,
        manifest,
        knowledge: nodes,
        questions: [
          ...current,
          {
            ...question,
            source: question.source + ' · Navi ' + threadId + origin,
          },
        ],
      });
      pack.questions = pack.questions.map((v) =>
        v.id === question.id
          ? { ...v, verified: true, verification: question.verification }
          : {
              ...v,
              verified: current.find((q) => q.id === v.id)?.verified,
              verification: current.find((q) => q.id === v.id)?.verification,
            },
      );
      if (inspectPackContent(pack).blocked.length)
        throw new Error(t('navi.practice.reviewRequired'));
      if (currentNamespace() !== owner.current) return;
      await installPack(pack, owner.current);
      if (alive.current && currentNamespace() === owner.current) {
        await refresh();
        setStage('saved');
      }
    } catch (e) {
      if (alive.current && currentNamespace() === owner.current)
        setError(e instanceof Error ? e.message : t('navi.error.save'));
    } finally {
      gate.current = false;
      setSaving(false);
    }
  }
  return (
    <section
      className="navi-operation-preview"
      aria-label={t('navi.practice.title')}
    >
      <header>
        <h3>{t('navi.practice.title')}</h3>
        <button type="button" onClick={close} aria-label={t('navi.close')}>
          ×
        </button>
      </header>
      <p>{t('navi.practice.description')}</p>
      {!closure.ok && <p role="alert">{t('navi.error.context')}</p>}
      <details>
        <summary>{t('navi.practice.original')}</summary>
        <MathText>{q.prompt}</MathText>
      </details>
      {stage === 'confirm' && (
        <button
          disabled={!aiReady || !closure.ok || !node || !skill}
          className="primary"
          onClick={() => void generate()}
        >
          {t('navi.practice.generate')}
        </button>
      )}
      {stage === 'generating' && (
        <p role="status">{t('navi.practice.checking')}</p>
      )}
      {stage === 'preview' && question && previewPack && (
        <>
          <MathText>{question.prompt}</MathText>
          <QuestionVisual question={question} stage="solution" />
          <details>
            <summary>{t('navi.practice.answer')}</summary>
            <MathText>{question.answer}</MathText>
            <MathText>{question.explanation}</MathText>
          </details>
          {!!report?.blocked.length && (
            <section className="navi-review-problems" role="status">
              <h4>{t('navi.practice.issues')}</h4>
              <ul>
                {report.blocked.map((r) => (
                  <li key={r.id}>
                    {r.scoring.join(' · ')}{' '}
                    {r.mapping && t('navi.practice.mappingIssue')}{' '}
                    {r.diagram?.ok === false && t('navi.practice.diagramIssue')}{' '}
                    {r.science?.reviewRequired &&
                      t('navi.practice.visualIssue')}{' '}
                    {r.needsImageChoice && t('navi.practice.visualIssue')}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <button
            type="button"
            onClick={() => setReview((v) => !v)}
            aria-expanded={review}
          >
            {t('navi.practice.review')}
          </button>
          {review && (
            <Suspense
              fallback={<p role="status">{t('navi.practice.loadingReview')}</p>}
            >
              <PackContentReview
                pack={previewPack}
                onChange={edit}
                busy={saving}
                onPendingChange={setPending}
              />
            </Suspense>
          )}
          <label>
            {t('navi.practice.repairRequest')}
            <textarea
              maxLength={1000}
              rows={2}
              value={repair}
              onChange={(e) => setRepair(e.target.value)}
            />
          </label>
          <div className="button-row">
            <button
              type="button"
              disabled={!aiReady}
              onClick={() => void generate()}
            >
              {t('navi.practice.regenerate')}
            </button>
            <button
              type="button"
              disabled={!aiReady || verified}
              onClick={() => void reverify()}
            >
              {t('navi.practice.reverify')}
            </button>
          </div>
          {!verified && <p>{t('navi.practice.reverifyRequired')}</p>}
          <label>
            {t('navi.practice.destination')}
            <select
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            >
              <option value="new">{t('navi.practice.newPack')}</option>
              {destinations.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
          <small>{t('navi.practice.safeDestination')}</small>
          {destination === 'new' && (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={150}
              aria-label={t('navi.practice.packName')}
            />
          )}
          <button
            disabled={saving || blocked}
            className="primary"
            onClick={() => void save()}
          >
            {t('navi.practice.confirmSave')}
          </button>
        </>
      )}
      {stage === 'saved' && <p role="status">{t('navi.practice.saved')}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
