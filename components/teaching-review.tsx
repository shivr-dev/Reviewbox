'use client';
import type { StudyAction } from '@/lib/study-orchestrator';
import { useReview } from './review-context';
import MathText from './math-text';
import { postponeStudyAction } from '@/lib/study-orchestrator-client';
import { currentNamespace } from '@/lib/store';
export function TeachingReview({
  action,
  onClose,
}: {
  action: StudyAction;
  onClose: () => void;
}) {
  const { data, start, notify } = useReview();
  const q = data.questions.find((q) => q.id === action.target),
    attempt = q
      ? data.events.filter((e) => !e.voidedBy && e.questionId === q.id).at(-1)
      : undefined;
  if (!q)
    return (
      <section className="director-subpage">
        <h1>这份学习材料已更新</h1>
        <button className="primary" onClick={onClose}>
          返回计划
        </button>
      </section>
    );
  return (
    <section className="director-subpage director-teaching">
      <span className="now-kicker">先理解，再巩固</span>
      <h1>{action.title}</h1>
      <p>
        先对照一道已有例题。反复失分提示需要调整学习方式，并不能单独证明某种能力缺失。
      </p>
      <h2>回看题目</h2>
      <MathText>{q.prompt}</MathText>
      <h2>参考答案</h2>
      <MathText>{q.answer}</MathText>
      {q.solution?.length ? (
        <>
          <h2>分步示例</h2>
          <ol>
            {q.solution.map((s, i) => (
              <li key={i}>
                <MathText>{s}</MathText>
              </li>
            ))}
          </ol>
        </>
      ) : q.explanation ? (
        <>
          <h2>解题思路</h2>
          <MathText>{q.explanation}</MathText>
        </>
      ) : (
        <p>这道题没有完整讲解，可在学科中导入课程或补充例题。</p>
      )}
      {attempt?.answer && (
        <details>
          <summary>对照上次作答</summary>
          <MathText>{attempt.answer}</MathText>
          <p>尝试找出第一处差异；系统暂不替你确认错误原因。</p>
        </details>
      )}
      <div className="director-actions">
        <button
          className="primary"
          onClick={async () => {
            try {
              await postponeStudyAction(action, 'seen', currentNamespace());
              if (action.items?.length)
                start(action.items, 'review', '理解后的小段巩固');
              else onClose();
            } catch (e) {
              notify(e instanceof Error ? e.message : '未能开始巩固');
            }
          }}
        >
          {action.items?.length ? '理解后，做少量巩固' : '已回顾，返回计划'}
        </button>
        <button className="quiet" onClick={onClose}>
          稍后继续
        </button>
      </div>
    </section>
  );
}
