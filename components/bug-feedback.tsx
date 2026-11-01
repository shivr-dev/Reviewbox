'use client';
import { useEffect, useRef, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { tr } from '@/lib/i18n';
import { currentNamespace } from '@/lib/store';
import {
  browserEnvironment,
  feedbackRequest,
  newReport,
  type FeedbackReceipt,
} from '@/lib/product-feedback';
import {
  PRODUCT_AREAS,
  FEEDBACK_CATEGORIES,
  type FeedbackCategory,
  type ProductArea,
  type BugReport,
} from '@/supabase/functions/review-feedback/contract';
const names: Record<ProductArea, string> = {
  home: '今天',
  study: '学习计划与练习',
  subjects: '学科与资料',
  results: '成绩与考试',
  workshop: '工坊',
  profile: '我的',
  devices: '手表与设备',
  other: '其他',
};
const statuses: Record<string, string> = {
  checking: '正在确认送达',
  queued: '已接收，等待自动发布',
  sending: '正在发布到 GitHub',
  retry: '发布暂时失败，系统会自动重试',
  submitted: '已发布',
  failed: '自动发布失败，请稍后重新提交',
};
const categoryNames: Record<FeedbackCategory, string> = { bug: 'Bug', suggestion: '建议', question: '问题' };
function readReceipts(ns: string): FeedbackReceipt[] {
  try {
    const value = JSON.parse(
      localStorage.getItem('review-feedback:' + ns) ?? '[]',
    );
    return Array.isArray(value)
      ? value
          .filter(
            (r) =>
              typeof r?.id === 'string' &&
              typeof r?.receipt === 'string' &&
              typeof r?.title === 'string' &&
              statuses[r.status] &&
              Date.parse(r.createdAt) > Date.now() - 90 * 86400000,
          )
          .slice(0, 5)
      : [];
  } catch {
    return [];
  }
}
export default function BugFeedback() {
  const ns = currentNamespace();
  const [title, setTitle] = useState(''),
    [description, setDescription] = useState('');
  const [area, setArea] = useState<ProductArea>('other');
  const [category, setCategory] = useState<FeedbackCategory>('bug');
  const [consent, setConsent] = useState(false),
    [environment, setEnvironment] = useState(false);
  const [busy, setBusy] = useState(false),
    [checking, setChecking] = useState(false);
  const [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [receipts, setReceipts] = useState(() => readReceipts(ns));
  const draft = useRef<BugReport | undefined>(undefined);
  const lifetime = useRef(new AbortController());
  const polling = useRef(false),
    sending = useRef(false),
    receiptRef = useRef(receipts);
  const alive = () =>
    !lifetime.current.signal.aborted && currentNamespace() === ns;
  function persist(next: FeedbackReceipt[]) {
    receiptRef.current = next;
    setReceipts(next);
    try {
      localStorage.setItem('review-feedback:' + ns, JSON.stringify(next));
    } catch {
      /* The on-screen receipt still works. */
    }
  }
  async function updateStatus(manual = false) {
    if (polling.current || !alive() || document.visibilityState === 'hidden')
      return;
    polling.current = true;
    if (manual) {
      setChecking(true);
      setError('');
    }
    try {
      const next = [...receiptRef.current];
      for (let i = 0; i < next.length; i++) {
        if (['submitted', 'failed'].includes(next[i].status)) continue;
        const result = await feedbackRequest(
          'status',
          { id: next[i].id, receipt: next[i].receipt },
          lifetime.current.signal,
        );
        if (!alive()) return;
        next[i] = { ...next[i], ...result };
      }
      if (alive()) {
        const updated = new Map(next.map((r) => [r.id, r]));
        persist(receiptRef.current.map((r) => updated.get(r.id) ?? r));
      }
    } catch (e) {
      if (manual && alive())
        setError(
          e instanceof Error
            ? e.message
            : tr('settings:状态检查未完成，请重试。'),
        );
    } finally {
      polling.current = false;
      if (alive()) setChecking(false);
    }
  }
  useEffect(() => {
    lifetime.current = new AbortController();
    void updateStatus();
    const timer = setInterval(() => void updateStatus(), 30000);
    return () => {
      clearInterval(timer);
      lifetime.current.abort();
    };
  }, [ns]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (sending.current || !consent) return;
    sending.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const same =
        draft.current &&
        draft.current.title === title.trim() &&
        draft.current.description === description.trim() &&
        draft.current.area === area &&
        draft.current.category === category &&
        !!draft.current.environment === environment;
      const report = same
        ? draft.current!
        : newReport(
            { title, description, area, category },
            environment ? browserEnvironment() : undefined,
          );
      draft.current = report;
      const receipt: FeedbackReceipt = {
        id: report.id,
        receipt: report.receipt,
        title: report.title,
        status: 'checking',
        createdAt: new Date().toISOString(),
      };
      persist(
        [
          receipt,
          ...receiptRef.current.filter((r) => r.id !== report.id),
        ].slice(0, 5),
      );
      const result = await feedbackRequest(
        'submit',
        report,
        lifetime.current.signal,
      );
      if (!alive()) return;
      persist(
        receiptRef.current.map((r) =>
          r.id === report.id ? { ...r, ...result } : r,
        ),
      );
      setNotice(
        tr(
          'settings:反馈已接收。通常约 10 分钟内自动发布，GitHub 调度繁忙时可能延迟。',
        ),
      );
      setTitle('');
      setDescription('');
      setConsent(false);
      draft.current = undefined;
    } catch (e) {
      if (alive())
        setError(
          e instanceof Error ? e.message : tr('settings:反馈未送达，请重试。'),
        );
    } finally {
      sending.current = false;
      if (alive()) setBusy(false);
    }
  }
  return (
    <div className="bug-feedback">
      <p className="settings-caption">
        {tr(
          'settings:描述遇到的问题，提交后会自动发布到 Reviewbox 的 GitHub Issues。此处不要求 GitHub 账号。',
        )}
      </p>
      <form onSubmit={submit}>
        <label>{tr('settings:反馈类别')}<select value={category} onChange={e => setCategory(e.target.value as FeedbackCategory)} disabled={busy}>
          {FEEDBACK_CATEGORIES.map(c => <option key={c} value={c}>{tr('settings:' + categoryNames[c])}</option>)}
        </select></label>
        <label>
          {tr('settings:反馈标题')}
          <input
            autoComplete="off"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            minLength={2}
            maxLength={120}
            required
            disabled={busy}
          />
        </label>
        <label>
          {tr('settings:发生在哪个功能区')}
          <select
            value={area}
            onChange={(e) => setArea(e.target.value as ProductArea)}
            disabled={busy}
          >
            {PRODUCT_AREAS.map((a) => (
              <option key={a} value={a}>
                {tr('settings:' + names[a])}
              </option>
            ))}
          </select>
        </label>
        <label>
          {tr('settings:反馈内容')}
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            minLength={10}
            maxLength={6000}
            required
            rows={7}
            disabled={busy}
            placeholder={category === 'suggestion' ? tr('settings:你希望增加或改进什么？它会怎样帮助学习？') : category === 'question' ? tr('settings:你想了解哪个功能？请说明遇到的疑问。') : tr('settings:你做了什么？预期发生什么？实际发生什么？请尽量写出复现步骤。')}
          />
        </label>
        <label className="feedback-check">
          <input
            type="checkbox"
            checked={environment}
            onChange={(e) => setEnvironment(e.target.checked)}
            disabled={busy}
          />
          <span>
            {tr('settings:附带应用版本、浏览器名称和屏幕类别（可选）')}
          </span>
        </label>
        <label className="feedback-check">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            required
            disabled={busy}
          />
          <span>
            {tr(
              'settings:我确认提交内容可以公开，且不包含密码、密钥或私人学习资料。',
            )}
          </span>
        </label>
        <button className="primary" type="submit" disabled={busy || !consent}>
          {busy
            ? tr('settings:正在提交…')
            : tr('settings:提交到 GitHub Issues')}
        </button>
      </form>
      <p className="settings-caption">
        {tr(
          'settings:反馈是你主动提交的公开内容，独立于产品改进统计开关。反馈服务暂存 90 天；已发布内容遵循 GitHub Issues 的公开记录规则。',
        )}
      </p>
      {error && (
        <p className="settings-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="settings-caption" role="status">
          {notice}
        </p>
      )}
      {!!receipts.length && (
        <section className="feedback-receipts">
          <div className="settings-sync-line">
            <strong>{tr('settings:本设备最近的反馈')}</strong>
            <button
              className="text-button"
              onClick={() => void updateStatus(true)}
              disabled={checking || busy}
            >
              <RefreshCw size={15} className={checking ? 'spin' : ''} />
              {tr('settings:刷新状态')}
            </button>
          </div>
          <ul>
            {receipts.map((r) => (
              <li key={r.id}>
                <span>
                  <strong>{r.title}</strong>
                  <small>{tr('settings:' + statuses[r.status])}</small>
                </span>
                {r.status === 'submitted' &&
                  r.url &&
                  /^https:\/\/github\.com\/shivr-dev\/Reviewbox\/issues\/[1-9]\d*$/.test(
                    r.url,
                  ) && (
                    <a href={r.url} target="_blank" rel="noopener noreferrer">
                      {tr('settings:查看 Issue')} <ExternalLink size={14} />
                    </a>
                  )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
