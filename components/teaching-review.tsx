'use client';
import {tr} from '@/lib/i18n';
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
        <h1>{tr("grading:这份学习材料已更新")}</h1>
        <button className="primary" onClick={onClose}>{tr("grading:返回计划")}</button>
      </section>
    );
  return (
    <section className="director-subpage director-teaching">
      <span className="now-kicker">{tr("grading:先理解，再巩固")}</span>
      <h1>{action.title}</h1>
      <p>{tr("grading:先对照一道已有例题。反复失分提示需要调整学习方式，并不能单独证明某种能力缺失。")}</p>
      <h2>{tr("grading:回看题目")}</h2>
      <MathText>{q.prompt}</MathText>
      <h2>{tr("grading:参考答案")}</h2>
      <MathText>{q.answer}</MathText>
      {q.solution?.length ? (
        <>
          <h2>{tr("grading:分步示例")}</h2>
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
          <h2>{tr("grading:解题思路")}</h2>
          <MathText>{q.explanation}</MathText>
        </>
      ) : (
        <p>{tr("grading:这道题没有完整讲解，可在学科中导入课程或补充例题。")}</p>
      )}
      {attempt?.answer && (
        <details>
          <summary>{tr("grading:对照上次作答")}</summary>
          <MathText>{attempt.answer}</MathText>
          <p>{tr("grading:尝试找出第一处差异；系统暂不替你确认错误原因。")}</p>
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
          {action.items?.length ? tr("grading:理解后，做少量巩固") : tr("grading:已回顾，返回计划")}
        </button>
        <button className="quiet" onClick={onClose}>{tr("grading:稍后继续")}</button>
      </div>
    </section>
  );
}
