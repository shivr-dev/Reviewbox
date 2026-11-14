import { Check } from 'lucide-react';
import type { ReactNode } from 'react';

type Choice<Value> = {
  value: Value;
  label: string;
  note?: string;
  icon?: ReactNode;
};

export function CheckInOptions<Value extends string | number>({
  choices,
  selected,
  onSelect,
  label,
  compact = false,
  disabled = false,
}: {
  choices: readonly Choice<Value>[];
  selected: readonly Value[];
  onSelect: (value: Value) => void;
  label: string;
  compact?: boolean;
  disabled?: boolean;
}) {
  return (
    <div
      className={
        'check-in-options' + (compact ? ' check-in-options-compact' : '')
      }
      role="group"
      aria-label={label}
    >
      {choices.map(({ value, label: title, note, icon }) => {
        const active = selected.includes(value);
        return (
          <button
            key={value}
            type="button"
            className="secondary check-in-option"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onSelect(value)}
          >
            {icon}
            <span className="check-in-option-copy">
              <strong>{title}</strong>
              {note && <span>{note}</span>}
            </span>
            {active && (
              <Check
                className="check-in-option-mark"
                aria-hidden="true"
                size={17}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
