'use client';
import {tr} from '@/lib/i18n';
import { useMemo, useState } from 'react';
import { useReview } from './review-context';
import { currentNamespace } from '@/lib/store';
import { saveExamScopeTemplate } from '@/lib/exam-schedule-client';
import type { Subject } from '@/lib/model';

export default function ExamScopePicker({
  subject,
  value,
  onChange,
  disabled = false,
}: {
  subject: Subject;
  value: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
}) {
  const { data, refresh } = useReview();
  const [query, setQuery] = useState(''),
    [templateName, setTemplateName] = useState(''),
    [saving, setSaving] = useState(false),
    [message, setMessage] = useState('');
  const nodes = data.nodes.filter((n) => n.subject === subject);
  const groups = useMemo(() => {
    const map = new Map<string, typeof nodes>();
    for (const n of nodes) {
      const name =
        [n.course, n.unit, n.chapter].filter(Boolean).join(' / ') || '未分章节';
      map.set(name, [...(map.get(name) || []), n]);
    }
    return [...map];
  }, [data.nodes, subject]);
  const templates = [
    ...(data.jobs ?? [])
      .filter((j) => j.kind === 'exam-scope-template' && j.subject === subject)
      .map((j) => ({ id: j.id, name: j.name, scope: j.scope })),
    ...data.exams
      .filter((e) => e.subject === subject && e.scope.length)
      .map((e) => ({
        id: 'exam:' + e.id,
        name: '沿用 ' + e.title,
        scope: e.scope,
      })),
  ].filter(
    (t, i, a) =>
      a.findIndex(
        (x) => [...x.scope].sort().join('|') === [...t.scope].sort().join('|'),
      ) === i,
  );
  const needle = query.trim().toLocaleLowerCase(),
    missing = value.filter((id) => !nodes.some((n) => n.id === id));
  async function saveTemplate() {
    const ns = currentNamespace();
    setSaving(true);
    setMessage('');
    try {
      await saveExamScopeTemplate(templateName, subject, value, ns);
      if (ns !== currentNamespace()) return;
      await refresh();
      setTemplateName('');
      setMessage('常用范围已保存');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '范围模板未保存，请重试');
    } finally {
      setSaving(false);
    }
  }
  return (
    <fieldset className="exam-scope-picker" disabled={disabled || saving}>
      <legend>{tr("results:考试范围")}</legend>
      <div className="scope-tools">
        <input
          type="search"
          aria-label={tr("results:搜索考试范围知识点")}
          placeholder={tr("results:搜索知识点、章节")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="button"
          className="secondary"
          onClick={() => onChange([])}
        >{tr("results:全学科范围")}</button>
      </div>
      <p role="status">
        {value.length
          ? tr("common:已选 {{v0}} 个知识点",{v0:(value.length)})
          : tr("common:全学科范围 · 共 {{v0}} 个知识点",{v0:(nodes.length)})}
      </p>
      {!!templates.length && (
        <label>{tr("results:常用与最近范围")}<select
            aria-label={tr("results:应用范围模板")}
            value=""
            onChange={(e) => {
              const t = templates.find((t) => t.id === e.target.value);
              if (t)
                onChange(
                  t.scope.filter((id: string) =>
                    nodes.some((n) => n.id === id),
                  ),
                );
            }}
          >
            <option value="">{tr("results:选择一个范围模板")}</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}（
                {
                  t.scope.filter((id: string) => nodes.some((n) => n.id === id))
                    .length
                }
                ）
              </option>
            ))}
          </select>
        </label>
      )}
      {!!missing.length && (
        <p role="alert">
          {missing.length}{tr("results:个已选知识点已不可用。")}<button
            type="button"
            className="quiet"
            onClick={() =>
              onChange(value.filter((id) => !missing.includes(id)))
            }
          >{tr("results:移除失效选择")}</button>
        </p>
      )}
      <div className="scope-chapters">
        {groups.map(([chapter, all]) => {
          const shown = all.filter((n) =>
            (n.title + ' ' + chapter).toLocaleLowerCase().includes(needle),
          );
          if (!shown.length) return null;
          const selected = all.filter((n) => value.includes(n.id)).length;
          return (
            <section key={chapter}>
              <div className="scope-chapter-heading">
                <b>{chapter}</b>
                <small>
                  {selected} / {all.length}
                </small>
                <button
                  className="quiet"
                  type="button"
                  aria-label={
                    (selected === all.length ? '取消本章 ' : '全选章节 ') +
                    chapter
                  }
                  onClick={() =>
                    onChange(
                      selected === all.length
                        ? value.filter((id) => !all.some((n) => n.id === id))
                        : [...new Set([...value, ...all.map((n) => n.id)])],
                    )
                  }
                >
                  {selected === all.length ? tr("results:取消本章") : tr("results:本章全选")}
                </button>
              </div>
              {shown.map((n) => (
                <label key={n.id}>
                  <input
                    type="checkbox"
                    checked={value.includes(n.id)}
                    onChange={(e) =>
                      onChange(
                        e.target.checked
                          ? [...value, n.id]
                          : value.filter((id) => id !== n.id),
                      )
                    }
                  />
                  {n.title}
                </label>
              ))}
            </section>
          );
        })}
        {!nodes.some((n) =>
          (n.title + ' ' + [n.course, n.unit, n.chapter].join(' '))
            .toLocaleLowerCase()
            .includes(needle),
        ) && <p>{tr("results:没有匹配的知识点。")}</p>}
      </div>
      <div className="scope-template-save">
        <input
          aria-label={tr("results:常用范围名称")}
          placeholder={tr("results:保存当前选择为常用范围")}
          maxLength={30}
          value={templateName}
          onChange={(e) => setTemplateName(e.target.value)}
        />
        <button
          className="secondary"
          type="button"
          disabled={!value.length || !templateName.trim()}
          onClick={() => void saveTemplate()}
        >
          {saving ? tr("results:保存中…") : tr("results:保存范围")}
        </button>
      </div>
      {message && <p role="status">{message}</p>}
      <small>{tr("results:不选择知识点表示全学科；章节全选会包含本章全部知识点。")}</small>
    </fieldset>
  );
}
