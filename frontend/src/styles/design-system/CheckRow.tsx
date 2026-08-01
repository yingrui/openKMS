import type { ReactNode } from 'react';

export type CheckRowProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  hint?: ReactNode;
  className?: string;
};

/** Labeled checkbox with optional supporting hint. */
export function CheckRow({ checked, onChange, title, hint, className }: CheckRowProps) {
  return (
    <label className={['ds-check-row', className].filter(Boolean).join(' ')}>
      <input
        type="checkbox"
        className="ds-checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="ds-check-row__body">
        <span className="ds-check-row__title">{title}</span>
        {hint != null && hint !== '' ? <span className="ds-check-row__hint">{hint}</span> : null}
      </span>
    </label>
  );
}
