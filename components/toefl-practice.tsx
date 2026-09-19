'use client';
import { useState } from 'react';
import { useReview } from './review-context';
import {
  createRun,
  examStages,
  paperReady,
  type ExamPaper,
} from '@/lib/exam-model';
import { currentNamespace, put } from '@/lib/store';
export default function ToeflPractice() {
  const { data, refresh, navigate, notify } = useReview(),
    [busy, setBusy] = useState(false);
  const papers = (data.jobs ?? []).filter(
    (p): p is ExamPaper =>
      p.kind === 'exam-paper' &&
      p.exam === 'TOEFL' &&
      !p.options.practice &&
      paperReady(p, data.questions),
  );
  return (
    <section className="panel toefl-practice">
      <p className="eyebrow">TOEFL PRACTICE</p>
      <h2>托福专项练习</h2>
      <p className="muted">
        从已导入试卷选择一个部分，沿用对应考试流程与计时。题目重复使用，练习记录独立保存。
      </p>
      {!papers.length && (
        <p>
          请先在「测试 → TOEFL」导入试卷，即可按阅读、听力、写作或口语进行练习。
        </p>
      )}
      {papers.map((p) => (
        <details key={p.id}>
          <summary>{p.title ?? 'TOEFL 私人试卷'}</summary>
          <div className="button-row">
            {examStages(p.exam, p.options).map((stage, index) => (
              <button
                className="secondary"
                disabled={busy}
                key={stage.id}
                onClick={async () => {
                  setBusy(true);
                  const ns = currentNamespace();
                  try {
                    const slots = stage.slots.map((s) => ({
                      ...s,
                      id: '0-' + s.route + '-' + s.index,
                      stage: 0,
                    }));
                    const practice: ExamPaper = {
                      ...p,
                      id: p.id + ':practice:' + index,
                      title: (p.title ?? 'TOEFL') + ' · ' + stage.title,
                      options: {
                        writing: false,
                        practice: true,
                        stages: [{ ...stage, breakAfter: 0, slots }],
                      },
                      questions: Object.fromEntries(
                        slots.map((s, i) => [
                          s.id,
                          p.questions[stage.slots[i].id],
                        ]),
                      ),
                    };
                    await put('job', practice, practice.id, false, ns);
                    const run = createRun(practice);
                    await put('job', run, run.id, false, ns);
                    if (currentNamespace() !== ns) return;
                    await refresh();
                    navigate('exam', run.id);
                  } catch (e) {
                    notify(e instanceof Error ? e.message : '练习暂未开始');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {stage.title} · {stage.count} 页
              </button>
            ))}
          </div>
        </details>
      ))}
    </section>
  );
}
