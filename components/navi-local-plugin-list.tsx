'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { changeNaviLocalPlugin, listNaviLocalPlugins } from '@/lib/navi-local-plugins';
import { currentNaviUI } from '@/lib/navi-ui';

export default function NaviLocalPluginList() {
  const { t } = useTranslation('study');
  const [plugins, setPlugins] = useState(listNaviLocalPlugins);
  const [error, setError] = useState(false);
  const [confirm, setConfirm] = useState('');
  const change = (id: string, operation: 'enable' | 'disable' | 'remove') => {
    try {
      setError(!changeNaviLocalPlugin(id, operation, currentNaviUI()));
      setPlugins(listNaviLocalPlugins());
      setConfirm('');
    } catch {
      setError(true);
    }
  };
  return (
    <details className="navi-local-plugins">
      <summary>{t('navi.plugins.title')}{plugins.length > 0 && ' · ' + plugins.length}</summary>
      {!plugins.length && <p>{t('navi.plugins.empty')}</p>}
      {!!plugins.length && <ul>{plugins.map(plugin => (
        <li key={plugin.id}>
          <strong>{plugin.name}</strong>
          <div>
            {confirm === plugin.id ? (
              <>
                <button type="button" onClick={() => change(plugin.id, 'remove')}>{t('navi.plugins.remove')}</button>
                <button type="button" onClick={() => setConfirm('')}>{t('navi.cancel')}</button>
              </>
            ) : (
              <>
                <button type="button" role="switch" aria-checked={plugin.enabled} aria-label={plugin.name}
                  onClick={() => change(plugin.id, plugin.enabled ? 'disable' : 'enable')}>
                  {t(plugin.enabled ? 'navi.plugins.enabled' : 'navi.plugins.disabled')}
                </button>
                <button type="button" onClick={() => setConfirm(plugin.id)}>{t('navi.plugins.delete')}</button>
              </>
            )}
          </div>
        </li>
      ))}</ul>}
      {error && <p role="alert">{t('navi.plugins.changeFailed')}</p>}
    </details>
  );
}
