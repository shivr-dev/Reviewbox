'use client';
import type { ReactNode } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { SUBJECTS } from '@/lib/model';
export function Choice({
  value,
  onChange,
  options,
  label,
  name,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label?: string;
  name?: string;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => v !== null && onChange(v)}
      name={name}
    >
      <SelectTrigger className="choice" aria-label={label ?? name}>
        <SelectValue>
          {options.find((o) => o.value === value)?.label ?? value}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export function SubjectChoice({
  value,
  onChange,
  all = false,
}: {
  value: string;
  onChange: (v: string) => void;
  all?: boolean;
}) {
  return (
    <Choice
      label="选择学科"
      value={value}
      onChange={onChange}
      options={[
        ...(all ? [{ value: 'all', label: '全部学科' }] : []),
        ...SUBJECTS.map((s) => ({ value: s.id, label: s.name })),
      ]}
    />
  );
}
export function Meter({
  value,
  color,
}: {
  value: number | null;
  color?: string;
}) {
  return (
    <div className="meter">
      <Progress
        value={value === null ? 0 : Math.round(value * 100)}
        style={color ? ({ '--meter-color': color } as React.CSSProperties) : undefined}
      />
      <span>{value === null ? '未评估' : Math.round(value * 100) + '%'}</span>
    </div>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-line" />
      <h3>{title}</h3>
      {children && <p className="muted">{children}</p>}
      {action}
    </div>
  );
}
export function Heading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
export const dateLabel = (s: string | null) =>
  !s
    ? '尚未复习'
    : new Date(s).toLocaleDateString('zh-CN', {
        month: 'short',
        day: 'numeric',
      });
