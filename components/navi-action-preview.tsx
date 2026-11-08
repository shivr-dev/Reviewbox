'use client';
import { useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import {
  currentNaviUI,
  reduceNaviUI,
  defaultLayout,
  type NaviUIAction,
  type WorkspaceLayout,
} from '@/lib/navi-ui';
const empty = defaultLayout(),
  subscribe = () => () => {};
export default function NaviActionPreview({
  actions,
  onAccept,
  onCancel,
}: {
  actions: NaviUIAction[];
  onAccept: () => void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation('study'),
    controller = currentNaviUI(),
    before = useSyncExternalStore(
      controller?.subscribe ?? subscribe,
      controller?.snapshot ?? (() => empty),
      () => empty,
    ),
    [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  let after: WorkspaceLayout | undefined;
  try {
    if (controller)
      after =
        actions.length === 1 &&
        actions[0].type === 'restoreLayout' &&
        actions[0].target !== 'default'
          ? controller.history.at(-1)
          : reduceNaviUI(before, actions, controller.capabilities);
  } catch {}
  const describe = (a: NaviUIAction) => {
    if (a.type === 'setLayout')
      return t('navi.live.describe.layout', {
        mode: t('navi.live.mode.' + a.mode),
      });
    if (a.type === 'splitView')
      return t(
        a.questionId
          ? 'navi.live.describe.compareQuestions'
          : 'navi.live.describe.split',
      );
    if (a.type === 'setFocusMode')
      return t('navi.live.mode.' + (a.enabled ? 'focus' : 'default'));
    if (a.type === 'setZoom')
      return t('navi.live.describe.zoom', { value: Math.round(a.value * 100) });
    if (a.type === 'setFontSize')
      return t('navi.live.describe.font', { value: a.value });
    if (a.type === 'configureComponent')
      return a.component === 'steps'
        ? t('navi.live.describe.steps', { value: a.visibleSteps })
        : t('navi.live.describe.molecule', {
            model: t('navi.live.model.' + a.model),
          });
    if (a.type === 'restoreLayout' || a.type === 'restoreWorkspace')
      return t('navi.live.reset');
    if (a.type === 'compareKnowledge')
      return t('navi.live.mode.knowledge-comparison');
    if (a.type === 'setGrid')
      return t('navi.live.describe.grid', { value: a.columns });
    if (a.type === 'resizePanel' || a.type === 'resizeComponent')
      return t('navi.live.describe.resize', {
        panel: t('navi.live.panel.' + a.panel),
      });
    if (a.type === 'arrangeComponents') return t('navi.live.describe.arrange');
    const name =
      'panel' in a
        ? a.panel
        : 'component' in a
          ? a.component
          : a.type === 'toggleSourcePanel'
            ? 'source'
            : a.type === 'showExplanation'
              ? 'explanation'
              : 'answer';
    return t('navi.live.describe.panel', {
      panel: t('navi.live.panel.' + name),
    });
  };
  const miniature = (layout: WorkspaceLayout) => (
    <div className={'navi-layout-mini mode-' + layout.mode}>
      <b>{t('navi.live.mode.' + layout.mode)}</b>
      <div>
        <span>{t('navi.live.primaryContent')}</span>
        {layout.panels.slice(0, 4).map((p) => (
          <span key={p}>{t('navi.live.panel.' + p)}</span>
        ))}
      </div>
      <small>
        {layout.fontSize}px · {Math.round(layout.zoom * 100)}% ·{' '}
        {layout.columns} {t('navi.live.columns')}
      </small>
    </div>
  );
  return (
    <section className="navi-action-proposal">
      <h4>{t('navi.live.proposal')}</h4>
      <ul>
        {actions.map((a, i) => (
          <li key={i}>{describe(a)}</li>
        ))}
      </ul>
      {after && (
        <div className="navi-action-layout-comparison">
          <section>
            <small>{t('navi.live.before')}</small>
            {miniature(before)}
          </section>
          <section>
            <small>{t('navi.live.after')}</small>
            {miniature(after)}
          </section>
        </div>
      )}
      {!after && <p>{t('navi.live.error.unsupported')}</p>}
      <div className="button-row">
        <button type="button" disabled={!after} onClick={onAccept}>
          {t('navi.live.accept')}
        </button>
        <button
          type="button"
          onClick={() => {
            setDismissed(true);
            onCancel?.();
          }}
        >
          {t('navi.cancel')}
        </button>
      </div>
    </section>
  );
}
