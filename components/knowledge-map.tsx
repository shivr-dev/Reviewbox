'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ChevronRight, Focus, Minus, Plus, Search } from 'lucide-react';
import type { Core } from 'cytoscape';
import { useTranslation } from 'react-i18next';
import { subjectLabel } from '@/lib/presentation';
import { tr } from '@/lib/i18n';
import { knowledgeGraph, type MapFilter } from '@/lib/knowledge-map';
import { buildQueue } from '@/lib/engine';
import { keyOf, SUBJECTS, type Node } from '@/lib/model';
import { aggregateMasteryStatus, dependencyLinks } from '@/lib/learning-evidence';
import { useReview } from './review-context';

const t = (key: string) => tr('subjects:' + key);
const statusFilters = { all: '全部状态', weak: '需要巩固', due: '到期复习' } as const;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function fitGraph(cy: Core) {
  cy.fit(undefined, 32);
  if (cy.zoom() > 1.2) {
    cy.zoom(1.2);
    cy.center();
  }
}

export default function KnowledgeMap() {
  useTranslation();
  const { data, states, subject, start, navigate } = useReview();
  const container = useRef<HTMLDivElement>(null);
  const graph = useRef<Core | null>(null);
  const detailTitle = useRef<HTMLHeadingElement>(null);
  const focusDetail = useRef(false);
  const centerSelection = useRef(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<MapFilter>('all');
  const [skills, setSkills] = useState(false);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [mapSubject, setMapSubject] = useState(subject);

  useEffect(() => { setMapSubject(subject); setSelected(''); }, [subject]);

  const projection = useMemo(() => knowledgeGraph(data, states, { subject: mapSubject, query, filter, skills }),
    [data, states, mapSubject, query, filter, skills]);
  const node = projection.nodes.find(item => item.id === selected);
  const packs = node ? data.packs.filter(pack => pack.nodeIds?.includes(node.id)) : [];
  const queue = useMemo(() => node ? buildQueue(data, { scope: [node.id], practice: true, limit: 6 }) : [], [data, node]);
  const relationships = useMemo(() => {
    if (!node) return { before: [], after: [], related: [] };
    const links = dependencyLinks(node);
    const beforeIds = new Set(links.filter(link => link.kind === 'requires').map(link => link.nodeId));
    const relatedIds = new Set([...node.relatedNodes, ...links.filter(link => link.kind !== 'requires').map(link => link.nodeId)]);
    const before: Node[] = [], after: Node[] = [], related: Node[] = [];
    for (const item of data.nodes) {
      if (item.id === node.id) continue;
      const incoming = dependencyLinks(item).filter(link => link.nodeId === node.id);
      if (beforeIds.has(item.id)) before.push(item);
      else if (incoming.some(link => link.kind === 'requires')) after.push(item);
      else if (incoming.length || relatedIds.has(item.id) || item.relatedNodes.includes(node.id)) related.push(item);
    }
    return { before, after, related };
  }, [data.nodes, node]);

  const chapters = useMemo(() => {
    const groups = new Map<string, { label: string; nodes: Node[] }>();
    for (const item of projection.nodes) {
      const chapter = item.chapter || item.unit || item.course;
      const groupKey = JSON.stringify([item.subject, item.course, item.unit, chapter]);
      const label = mapSubject === 'all' && chapter ? subjectLabel(item.subject) + ' · ' + chapter : chapter || subjectLabel(item.subject);
      const group = groups.get(groupKey);
      if (group) group.nodes.push(item);
      else groups.set(groupKey, { label, nodes: [item] });
    }
    return groups;
  }, [projection.nodes, mapSubject]);

  function revealDetail(id: string, center: boolean) {
    centerSelection.current = center;
    focusDetail.current = true;
    setSelected(id);
  }

  function selectRelated(item: Node) {
    if (!projection.nodes.some(entry => entry.id === item.id)) {
      if (mapSubject !== 'all' && mapSubject !== item.subject) setMapSubject(item.subject);
      setQuery('');
      setFilter('all');
    }
    revealDetail(item.id, true);
  }

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let cancelled = false;
    let cy: Core | undefined;
    setLoading(true);
    setError('');
    if (!projection.elements.length) { setLoading(false); return; }
    void import('cytoscape').then(({ default: cytoscape }) => {
      if (cancelled) return;
      const count = projection.elements.filter(entry => !entry.data.source).length;
      const edgeCount = projection.elements.length - count;
      const paint = getComputedStyle(element);
      const accent = paint.getPropertyValue('--rb-violet').trim() || '#66548e';
      cy = cytoscape({
        container: element,
        elements: projection.elements,
        style: [
          { selector: 'node', style: { label: 'data(label)', shape: 'round-rectangle', 'background-color': '#f9f6fd', 'border-color': '#a397bd', 'border-width': 1.6, color: '#2f2842', 'text-wrap': 'wrap', 'text-max-width': '108px', 'font-size': 13, 'font-family': paint.fontFamily, width: 118, height: 53, 'text-valign': 'center' } },
          { selector: 'node[kind="chapter"]', style: { width: 159, height: 48, 'text-max-width': '145px', 'font-size': 13, 'font-weight': 'bold', 'background-color': '#e5dcf2', 'border-color': '#8674ad' } },
          { selector: 'node[kind="skill"]', style: { shape: 'ellipse', width: 85, height: 41, 'font-size': 11, 'text-max-width': '74px', 'background-color': '#f1eef4' } },
          { selector: 'node.weak', style: { 'background-color': '#fcf0e5', 'border-color': '#a96c43' } },
          { selector: 'node.retained', style: { 'background-color': '#e5f2e9', 'border-color': '#618b73' } },
          { selector: 'node:selected', style: { 'border-width': 3.5, 'border-color': '#6b51a8', 'font-weight': 'bold' } },
          { selector: 'edge', style: { width: 2, 'line-color': '#83739e', 'target-arrow-color': '#83739e', 'target-arrow-shape': 'triangle', 'curve-style': 'bezier' } },
          { selector: 'edge.helpful,edge.parallel,edge.related,edge.contains,edge.membership', style: { width: 1.5, 'line-style': 'dashed', 'target-arrow-shape': 'none', 'line-color': '#998eaa' } },
          { selector: 'edge.focused', style: { width: 3, 'line-color': accent, 'target-arrow-color': accent } },
          { selector: '.map-muted', style: { opacity: 0.46 } },
        ],
        layout: edgeCount > projection.nodes.length * 0.5
          ? { name: 'cose', animate: false, fit: false, nodeRepulsion: () => 12500, idealEdgeLength: () => 89 }
          : { name: 'grid', animate: false, fit: false, avoidOverlap: true, cols: Math.max(1, Math.ceil(Math.sqrt(count * 1.4))) },
        selectionType: 'single',
        minZoom: 0.15,
        maxZoom: 2.8,
        wheelSensitivity: 0.28,
      });
      const nodes = cy.nodes();
      const box = nodes.boundingBox();
      // Use the wide canvas for long chains, leaving node labels upright.
      if (cy.width() > cy.height() * 1.2 && box.h > box.w * 1.15) {
        nodes.positions(item => {
          const { x, y } = item.position();
          return { x: y * 1.15, y: -x };
        });
      }
      fitGraph(cy);
      graph.current = cy;
      cy.on('tap', 'node', event => {
        const id = event.target.data('nodeId');
        if (typeof id === 'string') revealDetail(id, false);
      });
      setLoading(false);
    }).catch(cause => {
      if (!cancelled) { setError((cause as Error).message); setLoading(false); }
    });
    return () => {
      cancelled = true;
      cy?.destroy();
      graph.current = null;
    };
  }, [projection]);

  useEffect(() => {
    const title = detailTitle.current;
    if (!node || !title || !focusDetail.current) return;
    focusDetail.current = false;
    title.focus({ preventScroll: true });
    if (window.matchMedia('(max-width: 720px)').matches) {
      title.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'instant' : 'smooth' });
    }
  }, [node]);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(() => graph.current?.resize());
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const cy = graph.current;
    if (!cy || loading) return;
    const selection = node ? cy.getElementById('node:' + node.id) : undefined;
    cy.batch(() => {
      cy.elements().removeClass('focused map-muted').unselect();
      if (selection?.length) {
        selection.select();
        const neighbors = selection.closedNeighborhood();
        neighbors.edges().addClass('focused');
        cy.elements().not(neighbors).addClass('map-muted');
      }
    });
    if (selection?.length && centerSelection.current) {
      centerSelection.current = false;
      const zoom = Math.max(cy.zoom(), 0.93);
      cy.stop().animate({ center: { eles: selection }, zoom }, { duration: reducedMotion() ? 0 : 240 });
    }
  }, [node, loading]);

  function changeZoom(factor: number) {
    const cy = graph.current;
    if (!cy) return;
    cy.zoom({ level: cy.zoom() * factor, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
  }

  const mastery = (item: Node) => aggregateMasteryStatus(item.skills.map(skill => states[keyOf(item.id, skill.id)]));
  const nodeStatus = node ? mastery(node) : null;
  return <section className="knowledge-map">
    <header className="km-heading">
      <h1>{t('知识地图')}</h1>
      <select aria-label={t('地图学科')} value={mapSubject} onChange={event => {
        setMapSubject(event.target.value);
        setSelected('');
      }}>
        <option value="all">{t('全部学科总览')}</option>
        {SUBJECTS.map(item => <option key={item.id} value={item.id}>{subjectLabel(item.id)}</option>)}
      </select>
    </header>

    <div className="km-workbench">
      <div className="km-controls">
        <label className="km-search"><Search size={20} aria-hidden="true" />
          <input type="search" aria-label={t('搜索知识点')} placeholder={t('搜索知识点或能力')}
            value={query} onChange={event => { setQuery(event.target.value); setSelected(''); }} />
        </label>
        <div className="km-status-tabs" role="group" aria-label={t('知识状态')}>
          {(Object.keys(statusFilters) as MapFilter[]).map(key => <button type="button" key={key} aria-pressed={filter === key}
            onClick={() => { if (filter !== key) { setFilter(key); setSelected(''); } }}>{t(statusFilters[key])}</button>)}
        </div>
      </div>

      <div className="km-layout">
        <div className="km-map">
          <div className="km-canvas-wrap">
            <div className="km-canvas" ref={container} aria-label={t('可缩放知识关系图')} />
            {loading && <p className="km-map-state" role="status">{t('地图加载中…')}</p>}
            {error && <p className="km-map-state" role="alert">{t('地图加载失败：')}{error}</p>}
            {!loading && !error && !projection.nodes.length && <p className="km-map-state" role="status">{t('没有符合条件的知识点')}</p>}
            {!!projection.nodes.length && !error && <div className="km-zoom">
              <button type="button" aria-label={t('放大')} title={t('放大')} onClick={() => changeZoom(1.24)}><Plus size={19} /></button>
              <button type="button" aria-label={t('缩小')} title={t('缩小')} onClick={() => changeZoom(1 / 1.24)}><Minus size={19} /></button>
              <button type="button" aria-label={t('适应画面')} title={t('适应画面')} onClick={() => { if (graph.current) fitGraph(graph.current); }}><Focus size={18} /></button>
            </div>}
          </div>
          <div className="km-map-foot">
            <div className="km-legend">
              <span><i aria-hidden="true" />{t('map.prerequisite')}</span>
              <span><i aria-hidden="true" />{t('map.support')}</span>
            </div>
            <label className="km-skills">
              <input type="checkbox" checked={skills} onChange={event => setSkills(event.target.checked)} />
              {t('显示能力')}
            </label>
          </div>
        </div>

        <aside className="km-panel">
          {node ? <>
            <div className="km-panel-heading"><button className="km-return" type="button" onClick={() => setSelected('')}>
              <ArrowLeft size={16} />{t('知识点')}
            </button></div>
            <div className="km-panel-body km-detail" key={node.id}>
              <p className="km-context">{[subjectLabel(node.subject), node.chapter || node.unit || node.course].filter(Boolean).join(' · ')}</p>
              <h2 ref={detailTitle} tabIndex={-1}>{node.title}</h2>
              {nodeStatus && <p className="km-mastery" data-status={nodeStatus}>{t(nodeStatus)}</p>}
              {node.description && <p className="km-description">{node.description}</p>}
              <button type="button" className="primary km-practice" disabled={!queue.length} onClick={() => start(queue)}>
                {t('开始针对性练习')}<ArrowRight size={16} />
              </button>
              {!queue.length && <p className="km-availability">{t('此知识点暂无通过核验的可用题目。')}</p>}
              {([['map.prerequisite', relationships.before], ['map.next', relationships.after], ['关联知识点', relationships.related]] as const)
                .filter(([, items]) => items.length > 0).map(([label, items]) => <section className="km-related" key={label}>
                <h3>{t(label)}</h3>
                {items.map(item => <button className="km-row" key={item.id} type="button" onClick={() => selectRelated(item)}>
                  <span>{item.title}</span><ChevronRight size={16} />
                </button>)}
              </section>)}
              <section className="km-related">
                <h3>{t('关联学习包')}</h3>
                {packs.length ? packs.map(pack => <button type="button" className="km-row" key={pack.id}
                  onClick={() => ['review-core', 'review-framework'].includes(pack.id)
                    ? navigate('subjects', node.subject, 'materials')
                    : navigate('subjects', node.subject, 'pack', pack.id)}>
                  <span>{pack.title} · v{pack.version}</span><ChevronRight size={16} />
                </button>) : <p className="km-availability">{t('来自知识框架或独立内容')}</p>}
              </section>
            </div>
          </> : <>
            <div className="km-panel-heading">
              <h2>{t('知识点')}</h2><span aria-label={String(projection.nodes.length)}>{projection.nodes.length}</span>
            </div>
            <div className="km-panel-body km-index">
              {!chapters.size && <p>{t('没有符合条件的知识点')}</p>}
              {[...chapters.entries()].map(([key, group]) => <section className="km-group" key={key}>
                <h3>{group.label}</h3>
                {group.nodes.map(item => <button className="km-row" key={item.id} type="button" onClick={() => revealDetail(item.id, true)}>
                  <i data-status={mastery(item)} aria-hidden="true" /><span>{item.title}</span><ChevronRight size={16} />
                </button>)}
              </section>)}
            </div>
          </>}
        </aside>
      </div>
    </div>
    {projection.missingReferences.length > 0 && <p className="km-missing">{tr('subjects:map.missing', { count: projection.missingReferences.length })}</p>}
  </section>;
}
