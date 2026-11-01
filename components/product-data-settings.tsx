'use client';
import { useEffect, useState } from 'react';
import { useReview } from './review-context';
import { currentNamespace, loadData, put } from '@/lib/store';
import {
  collectionEnabled,
  storeCollectionPreference,
  productInsights,
} from '@/lib/product-insights';
import { Switch } from './ui/switch';
import { tr } from '@/lib/i18n';
import { hasAcceptedAgreement } from '@/lib/product-agreement';
export default function ProductDataSettings() {
  const { data, refresh } = useReview();
  const ns = currentNamespace();
  const [enabled, setEnabled] = useState(() =>
    collectionEnabled(ns, data.settings.productDataCollection),
  );
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  useEffect(() => {
    const update = () =>
      setEnabled(collectionEnabled(ns, data.settings.productDataCollection));
    update();
    window.addEventListener('storage', update);
    return () => window.removeEventListener('storage', update);
  }, [ns, data.settings.productDataCollection]);
  async function toggle(value: boolean) {
    if (busy) return;
    const preference = { enabled: value, updatedAt: new Date().toISOString() };
    setBusy(true);
    setNotice('');
    // Stop first; a failed sync must never leave collection running after opt-out.
    productInsights.configure(
      value && hasAcceptedAgreement(data.settings.termsAcceptance),
    );
    setEnabled(value);
    try {
      storeCollectionPreference(ns, preference);
      const latest = await loadData();
      if (currentNamespace() !== ns) return;
      await put(
        'setting',
        { ...latest.settings, productDataCollection: preference },
        'settings',
        false,
        ns,
      );
      await refresh();
      setNotice(
        value
          ? tr('settings:已开启产品改进统计')
          : tr('settings:已关闭，并清空尚未发送的统计'),
      );
    } catch {
      if (currentNamespace() === ns)
        setNotice(
          tr('settings:当前设备的选择已生效，账户设置尚未保存，请重试。'),
        );
    } finally {
      if (currentNamespace() === ns) setBusy(false);
    }
  }
  return (
    <section className="product-data-settings">
      <div className="settings-sync-line">
        <span>
          <strong>{tr('settings:帮助改进 Reviewbox')}</strong>
          <small>{tr('settings:产品改进统计 · 默认开启')}</small>
        </span>
        <Switch
          aria-label={tr('settings:收集产品改进统计')}
          checked={enabled}
          disabled={busy}
          onCheckedChange={toggle}
        />
      </div>
      <p className="settings-caption">
        {tr(
          'settings:仅统计功能区访问次数、粗略使用时长和错误次数。不上传邮箱、题目、答案、笔记、考试成绩、GPA、密钥或完整访问路径。关闭不影响学习和账户同步。',
        )}
      </p>
      <p className="settings-caption">
        {tr(
          'settings:还会按应用版本、浏览器与屏幕类别汇总练习开始/完成、导入核验/安装、文档生成/下载点击等流程节点，用于定位卡点和兼容问题。下载点击不等于文件已经保存。',
        )}
      </p>
      {!hasAcceptedAgreement(data.settings.termsAcceptance) && (
        <p className="settings-caption">
          {tr('settings:尚未同意使用协议，统计尚未开始。')}
        </p>
      )}
      <details>
        <summary>{tr('settings:查看收集与保留规则')}</summary>
        <p className="settings-caption">
          {tr(
            'settings:统计不含用户或设备标识，按天汇总，保留 90 天。限流使用每天变化的网络摘要，保留 7 天；不保存原始 IP。服务提供商可能保留基础访问日志。关闭会停止后续发送，已汇总的数据无法再关联到个人。',
          )}
        </p>
      </details>
      {notice && (
        <p className="settings-caption" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
