'use client';
import {
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Undo2, RotateCcw, Save, X, GripVertical } from 'lucide-react';
import {
  NaviUIController,
  workspaceModes,
  panelNames,
  workspaceLayoutSchema,
  type NaviUIAction,
  type WorkspaceLayout,
} from '@/lib/navi-ui';
import { currentNamespace, put } from '@/lib/store';
import { useReview } from './review-context';
import { NaviDiagramContext } from './navi-diagram-control';

export default function NaviWorkspaceFrame({
  controller,
  storageKey,
  children,
  renderPanel,
}: {
  controller: NaviUIController;
  storageKey: string;
  children: ReactNode;
  renderPanel: (panel: string, layout: WorkspaceLayout) => ReactNode;
}) {
  const { t } = useTranslation('study'),
    { data, refresh, notify } = useReview(),
    ns = currentNamespace(),
    layout = useSyncExternalStore(
      controller.subscribe,
      controller.snapshot,
      controller.snapshot,
    );
  const [error, setError] = useState(''),
    [saving, setSaving] = useState(false),
    [tools, setTools] = useState(false),
    [name, setName] = useState(''),
    [savingTemplate, setSavingTemplate] = useState(false);
  const presets = (data.jobs ?? []).filter(
    (j) =>
      j.kind === 'navi-layout' &&
      (j.storageKey === storageKey || j.id === 'navi-layout:' + storageKey),
  );
  const exec = (actions: NaviUIAction[]) => {
    const result = controller.execute(actions, 'user');
    setError(result.ok ? '' : t('navi.live.error.' + result.reason));
  };
  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      const id =
        'navi-layout:' +
        storageKey +
        ':' +
        (name.trim() ? crypto.randomUUID() : 'default');
      await put(
        'job',
        {
          id,
          kind: 'navi-layout',
          storageKey,
          title: name.trim() || t('navi.live.defaultTemplate'),
          layout,
          updatedAt: new Date().toISOString(),
        },
        id,
        false,
        ns,
      );
      if (currentNamespace() === ns) {
        await refresh();
        notify(t('navi.live.saved'));
        setSavingTemplate(false);
        setName('');
      }
    } catch {
      setError(t('navi.error.save'));
    } finally {
      setSaving(false);
    }
  }
  function restore(value: unknown) {
    const parsed = workspaceLayoutSchema.safeParse(value);
    if (!parsed.success) {
      setError(t('navi.live.error.invalid'));
      return;
    }
    exec([{ type: 'restoreWorkspace', layout: parsed.data }]);
  }
  function move(from: string, to: string) {
    const next = [...layout.panels],
      a = next.indexOf(from as any),
      b = next.indexOf(to as any);
    if (a < 0 || b < 0 || a === b) return;
    next.splice(b, 0, next.splice(a, 1)[0]);
    exec([{ type: 'arrangeComponents', panels: next }]);
  }
  return (
    <NaviDiagramContext.Provider
      value={{ zoom: layout.zoom, molecule: layout.molecule }}
    >
      <section
        className={'navi-live-learning navi-layout-' + layout.mode}
        data-workspace-source={controller.target?.id}
        style={
          {
            '--navi-panel-width': layout.width + '%',
            '--navi-font': layout.fontSize + 'px',
            '--navi-zoom': layout.zoom,
            '--navi-grid-columns': layout.columns,
          } as CSSProperties
        }
      >
        {!controller.capabilities.protected && (
          <div className="navi-live-toolbar">
            <button
              type="button"
              className="text-button"
              aria-expanded={tools}
              onClick={() => setTools((v) => !v)}
            >
              {t('navi.live.tools')}
            </button>
            {(tools || layout.mode !== 'default') && (
              <>
                <select
                  aria-label={t('navi.live.layout')}
                  value={layout.mode}
                  onChange={(e) =>
                    exec([
                      {
                        type: 'setLayout',
                        mode: e.target.value as typeof layout.mode,
                      },
                    ])
                  }
                >
                  {workspaceModes.map((m) => (
                    <option value={m} key={m}>
                      {t('navi.live.mode.' + m)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() =>
                    exec([{ type: 'restoreLayout', target: 'undo' }])
                  }
                  aria-label={t('navi.live.undo')}
                >
                  <Undo2 size={16} />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    exec([{ type: 'restoreLayout', target: 'default' }])
                  }
                  aria-label={t('navi.live.reset')}
                >
                  <RotateCcw size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setSavingTemplate((v) => !v)}
                >
                  <Save size={16} />
                  {t('navi.live.save')}
                </button>
                {presets.length > 0 && (
                  <select
                    aria-label={t('navi.live.load')}
                    value=""
                    onChange={(e) =>
                      restore(
                        presets.find((p) => p.id === e.target.value)?.layout,
                      )
                    }
                  >
                    <option value="">{t('navi.live.load')}</option>
                    {presets.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title ?? t('navi.live.defaultTemplate')}
                      </option>
                    ))}
                  </select>
                )}
                <label>
                  {t('navi.live.width')}
                  <input
                    type="range"
                    min="25"
                    max="75"
                    value={layout.width}
                    onChange={(e) =>
                      exec([
                        {
                          type: 'resizePanel',
                          panel: layout.panels[0] ?? 'question',
                          percent: Number(e.target.value),
                        },
                      ])
                    }
                  />
                </label>
              </>
            )}
            {tools && (
              <>
                <select
                  aria-label={t('navi.live.addPanel')}
                  value=""
                  onChange={(e) =>
                    exec([
                      {
                        type: 'mountRegisteredComponent',
                        component: e.target
                          .value as (typeof panelNames)[number],
                      },
                    ])
                  }
                >
                  <option value="">{t('navi.live.addPanel')}</option>
                  {controller.capabilities.panels
                    .filter((p) => !layout.panels.includes(p as any))
                    .map((p) => (
                      <option value={p} key={p}>
                        {t('navi.live.panel.' + p)}
                      </option>
                    ))}
                </select>
                <label>
                  {t('navi.live.columns')}
                  <select
                    value={layout.columns}
                    onChange={(e) =>
                      exec([
                        { type: 'setGrid', columns: Number(e.target.value) },
                      ])
                    }
                  >
                    {[1, 2, 3].map((n) => (
                      <option value={n} key={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('navi.live.fontSize')}
                  <input
                    type="range"
                    min="14"
                    max="26"
                    value={layout.fontSize}
                    onChange={(e) =>
                      exec([
                        { type: 'setFontSize', value: Number(e.target.value) },
                      ])
                    }
                  />
                </label>
              </>
            )}
          </div>
        )}
        {savingTemplate && (
          <form
            className="navi-preset-save"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder={t('navi.live.templateName')}
              aria-label={t('navi.live.templateName')}
            />
            <button disabled={saving}>{t('navi.confirm')}</button>
            <button type="button" onClick={() => setSavingTemplate(false)}>
              {t('navi.cancel')}
            </button>
          </form>
        )}
        {error && <p role="alert">{error}</p>}
        <div className="navi-live-columns">
          <div className="navi-live-question">{children}</div>
          {layout.panels.length > 0 && (
            <aside
              className="navi-live-panels"
              aria-label={t('navi.live.panels')}
            >
              {layout.panels.map((panel, i) => {
                const cell = layout.cells[panel] ?? { span: 1, height: 360 };
                return (
                  <section
                    className="navi-grid-cell"
                    key={panel}
                    style={
                      {
                        gridColumn:
                          'span ' + Math.min(layout.columns, cell.span),
                        '--navi-cell-height': cell.height + 'px',
                      } as CSSProperties
                    }
                    onDragOver={(e) => {
                      if (
                        e.dataTransfer.types.includes(
                          'application/reviewbox-panel',
                        )
                      )
                        e.preventDefault();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      move(
                        e.dataTransfer.getData('application/reviewbox-panel'),
                        panel,
                      );
                    }}
                  >
                    <header>
                      <button
                        className="navi-drag-handle"
                        type="button"
                        draggable
                        onDragStart={(e) =>
                          e.dataTransfer.setData(
                            'application/reviewbox-panel',
                            panel,
                          )
                        }
                        aria-label={t('navi.live.dragPanel')}
                      >
                        <GripVertical size={14} />
                      </button>
                      <h3>{t('navi.live.panel.' + panel)}</h3>
                      <span>
                        <button
                          type="button"
                          disabled={!i}
                          aria-label={t('navi.live.up')}
                          onClick={() => move(panel, layout.panels[i - 1])}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          disabled={i === layout.panels.length - 1}
                          aria-label={t('navi.live.down')}
                          onClick={() => move(panel, layout.panels[i + 1])}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          aria-label={t('navi.close')}
                          onClick={() =>
                            exec([
                              {
                                type: 'removeRegisteredComponent',
                                component: panel,
                              },
                            ])
                          }
                        >
                          <X size={14} />
                        </button>
                      </span>
                    </header>
                    <div className="navi-cell-content">
                      {renderPanel(panel, layout)}
                    </div>
                    <details className="navi-cell-size">
                      <summary>{t('navi.live.panelSize')}</summary>
                      <label>
                        {t('navi.live.columns')}
                        <input
                          type="range"
                          min="1"
                          max="3"
                          value={cell.span}
                          onChange={(e) =>
                            exec([
                              {
                                type: 'resizeComponent',
                                panel,
                                span: Number(e.target.value),
                                height: cell.height,
                              },
                            ])
                          }
                        />
                      </label>
                      <label>
                        {t('navi.live.height')}
                        <input
                          type="range"
                          min="180"
                          max="900"
                          step="20"
                          value={cell.height}
                          onChange={(e) =>
                            exec([
                              {
                                type: 'resizeComponent',
                                panel,
                                span: cell.span,
                                height: Number(e.target.value),
                              },
                            ])
                          }
                        />
                      </label>
                    </details>
                  </section>
                );
              })}
            </aside>
          )}
        </div>
      </section>
    </NaviDiagramContext.Provider>
  );
}
