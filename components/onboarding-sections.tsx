'use client';

import {
  Clock3,
  Eye,
  Flag,
  Import,
  ShieldCheck,
  Snowflake,
  Target,
} from 'lucide-react';
import { useState } from 'react';
import { tr } from '@/lib/i18n';
import LibraryView from './library-view';
import { Penguin } from './learning-game';

export function OnboardingWelcome() {
  return (
    <div className="onboarding-welcome">
      <Penguin action="welcome" actionKey="onboarding-welcome" />
      <h1 id="onboarding-title" tabIndex={-1}>
        {tr('planner:欢迎来到 Review')}
      </h1>
      <p>{tr('planner:先做一点设置，再开始学习。')}</p>
    </div>
  );
}

export function OnboardingDemo() {
  const [revealed, setRevealed] = useState(false);
  const [rating, setRating] = useState('');
  return (
    <div className="onboarding-demo">
      <span>{tr('planner:试一试 · 不记录成绩')}</span>
      <strong>{revealed ? tr('planner:狼藉') : 'láng jí'}</strong>
      {revealed ? (
        <div className="onboarding-demo-ratings">
          {['答错', '不确定', '答对'].map((value) => (
            <button
              key={value}
              type="button"
              className={'secondary' + (rating === value ? ' selected' : '')}
              aria-pressed={rating === value}
              onClick={() => setRating(value)}
            >
              {value === '答错' ? tr('study:答错') : tr('planner:' + value)}
            </button>
          ))}
        </div>
      ) : (
        <button className="secondary" onClick={() => setRevealed(true)}>
          <Eye size={18} />
          {tr('planner:显示答案')}
        </button>
      )}
      <small aria-live="polite">
        {tr(
          rating
            ? 'planner:就是这样。真实练习会记住你的判断。'
            : 'planner:看拼音写汉字由你手动检查。',
        )}
      </small>
    </div>
  );
}

const symbols = [
  [Clock3, '到期复习', 'symbolReview'],
  [Flag, '能力测试', 'symbolTest'],
  [Snowflake, '连胜冻结', 'symbolStreak'],
  [ShieldCheck, '私有同步', 'symbolSync'],
] as const;
export function OnboardingSymbols() {
  return (
    <div className="onboarding-symbols">
      {symbols.map(([Icon, title, text]) => (
        <article key={title}>
          <Icon aria-hidden="true" />
          <h3>{tr('common:' + title)}</h3>
          <span>{tr('dashboard:checkin.' + text)}</span>
        </article>
      ))}
    </div>
  );
}

export function OnboardingImport({
  count,
  open,
  toggle,
}: {
  count: number;
  open: boolean;
  toggle: () => void;
}) {
  return (
    <>
      <div className="onboarding-import-choice">
        <Import aria-hidden="true" />
        <strong>
          {count
            ? tr('dashboard:checkin.questionsReady', { count })
            : tr('planner:添加自己的内容')}
        </strong>
        <button
          className="secondary"
          onClick={toggle}
          aria-expanded={open}
          aria-controls="onboarding-library"
        >
          {tr(open ? 'planner:收起导入工具' : 'planner:打开导入工具')}
        </button>
        <small>{tr('planner:支持手动导入，无需 AI 额度。')}</small>
      </div>
      {open && (
        <div id="onboarding-library">
          <LibraryView />
        </div>
      )}
    </>
  );
}

export function OnboardingDiagnostic({
  count,
  back,
  disabled,
}: {
  count: number;
  back: () => void;
  disabled: boolean;
}) {
  return (
    <div className="assistant-initial-test">
      <Target size={42} aria-hidden="true" />
      <strong>{tr('dashboard:checkin.questionsReady', { count })}</strong>
      <small>{tr('planner:未测学科保留“未评估”。')}</small>
      {!count && (
        <button className="secondary" disabled={disabled} onClick={back}>
          {tr('planner:先导入题目')}
        </button>
      )}
    </div>
  );
}

export function OnboardingBeta({
  disabled,
  feedback,
}: {
  disabled: boolean;
  feedback: () => void;
}) {
  return (
    <div className="onboarding-beta">
      <span className="onboarding-beta-label">BETA</span>
      <p>
        {tr(
          'settings:有些功能仍在打磨。遇到卡住、显示异常或答案问题，欢迎帮忙找 Bug。',
        )}
      </p>
      <p className="settings-caption">
        {tr(
          'settings:反馈入口：我的 → 数据与隐私 → 反馈。写下操作步骤、预期和实际结果，就很有帮助。',
        )}
      </p>
      <button className="secondary" disabled={disabled} onClick={feedback}>
        {tr('settings:去反馈入口看看')}
      </button>
    </div>
  );
}
