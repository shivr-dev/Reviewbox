'use client';
import { useState } from 'react';
import { useReview } from './review-context';
import { currentNamespace, loadData, put } from '@/lib/store';
import {
  AGREEMENT_VERSION,
  hasAcceptedAgreement,
} from '@/lib/product-agreement';
import { tr } from '@/lib/i18n';
const clauses = [
  [
    '使用与学习判断',
    'Reviewbox 为学习辅助工具。AI 生成、自动评分、科学图形和学习建议可能出错，请核验重要结论；模拟考试并非考试机构官方服务，系统不承诺提分或特定 GPA。测试版功能可能调整，请定期备份。',
  ],
  [
    '版权与学习资料',
    '教材、题目、图片、音乐和学习包的权利归原权利人。导入或公开分享时，请确认你拥有相应使用权限；个人学习不等于获得公开传播许可。你保留自有内容的权利，使用本应用不会转让这些权利。第三方工具与素材继续适用各自许可证。',
  ],
  [
    '个人内容与智能服务',
    '学习记录先保存在本设备。登录后可同步到自己的 Supabase 账户；公共学习包分享需要另行确认。使用智能功能时，相关题目或资料会发送至已配置的 AI 服务，适用该服务的数据政策；请勿导入无权处理的敏感信息。',
  ],
  [
    '产品改进统计与选择',
    '改进统计开关默认开启，但在你同意本说明前不发送。按应用版本、浏览器和屏幕类别汇总功能区访问、粗略可见时长、练习开始与完成、导入核验与安装、文档生成与下载点击、注册待确认与登录完成等流程节点和错误次数；不收集账号、题目、答案、笔记、成绩、GPA、完整网址或错误正文。你可在「我的 → 数据与隐私」关闭；关闭不影响学习功能。',
  ],
  [
    '保留期限与服务',
    '统计按天汇总且不含用户或设备标识，保留 90 天。防滥用限流仅使用每天变化的网络摘要，保留 7 天，不保存原始 IP；基础网络日志可能由服务提供商保留。关闭后清空未发统计并停止后续发送；已汇总数据无法再识别到个人。',
  ],
  [
    '公开反馈',
    '反馈仅在你主动填写并确认公开后提交到 GitHub Issues。请勿填写密码、密钥或私人资料；公开内容可被其他人查看，关闭统计不会撤回公开反馈。反馈服务的正文在发布 30 天后清除，回执最长保留 90 天；GitHub 上的公开记录按其规则保留。',
  ],
  [
    '数据管理与联系',
    '你可在「数据与隐私」导出、恢复和清理学习记录，在设备页解绑手表。清理本地内容不会自动删除已公开的学习包或 Issue。发现侵权、数据或软件问题，可通过 反馈联系维护者；不要在公开反馈中附上敏感证明材料。',
  ],
] as const;
export function UsageAgreement() {
  return (
    <article
      className="usage-agreement"
      aria-label={tr('settings:使用协议与隐私说明')}
    >
      <p className="settings-caption">
        {tr('settings:使用协议与隐私说明')} · {AGREEMENT_VERSION}
      </p>
      {clauses.map(([title, text], index) => (
        <section key={title}>
          <h3>
            {index + 1}. {tr('settings:' + title)}
          </h3>
          <p>{tr('settings:' + text)}</p>
        </section>
      ))}
      <p className="settings-caption">
        <a
          href="https://supabase.com/privacy"
          target="_blank"
          rel="noopener noreferrer"
        >
          Supabase Privacy
        </a>{' '}
        ·{' '}
        <a
          href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub Privacy
        </a>
      </p>
    </article>
  );
}
export default function AgreementSettings() {
  const { data, refresh } = useReview();
  const accepted = hasAcceptedAgreement(data.settings.termsAcceptance);
  const [checked, setChecked] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function accept() {
    if (!checked || busy) return;
    const ns = currentNamespace();
    setBusy(true);
    setError('');
    try {
      const latest = await loadData(ns);
      if (currentNamespace() !== ns) return;
      await put(
        'setting',
        {
          ...latest.settings,
          termsAcceptance: {
            version: AGREEMENT_VERSION,
            acceptedAt: new Date().toISOString(),
          },
        },
        'settings',
        false,
        ns,
      );
      await refresh();
    } catch {
      if (ns === currentNamespace())
        setError(tr('settings:未能保存同意记录，请重试。'));
    } finally {
      if (ns === currentNamespace()) setBusy(false);
    }
  }
  return (
    <div>
      <UsageAgreement />
      {accepted ? (
        <p role="status">{tr('settings:已同意当前版本协议')}</p>
      ) : (
        <div className="agreement-accept">
          <label className="feedback-check">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              disabled={busy}
            />
            <span>{tr('settings:我已阅读并同意使用协议与隐私说明')}</span>
          </label>
          <button
            className="primary"
            disabled={!checked || busy}
            onClick={() => void accept()}
          >
            {busy ? tr('settings:正在保存…') : tr('settings:同意并保存')}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="settings-error">
          {error}
        </p>
      )}
    </div>
  );
}
