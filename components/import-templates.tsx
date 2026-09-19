'use client';
import { useState } from 'react';
import { QUESTION_TYPES } from '@/lib/question-tools';
import {
  learningTemplate,
  examTaskTemplate,
  EXAM_TASK_TEMPLATES,
} from '@/lib/import-templates';
export default function ImportTemplates({
  onUse,
  exam = false,
}: {
  onUse: (value: string) => void;
  exam?: boolean;
}) {
  const [type, setType] = useState(exam ? 'mcq' : 'choice');
  return (
    <details className="manual-templates">
      <summary>按格式手动导入（无需 AI）</summary>
      <p className="muted">
        选择题型后载入可编辑模板，替换题干、答案、解析与知识点，再点击识别预览。不会自动加入示例。
      </p>
      <div className="button-row">
        <select
          aria-label="导入模板题型"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          {(exam
            ? Object.keys(EXAM_TASK_TEMPLATES).map((id) => ({ id, label: id }))
            : QUESTION_TYPES
          ).map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <button
          className="secondary"
          onClick={() =>
            onUse(exam ? examTaskTemplate(type) : learningTemplate(type))
          }
        >
          载入格式模板
        </button>
      </div>
      {exam && (
        <p className="muted">
          模板默认 TOEFL；SAT / ACT 试卷可按考试包 Skill 修改 exam、flow
          和对应章节。任意完整 JSON 也可直接粘贴导入。
        </p>
      )}
    </details>
  );
}
