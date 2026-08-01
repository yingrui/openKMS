import type { ReactNode } from 'react';

export type CheckListProps = {
  children: ReactNode;
  className?: string;
};

/** Scrollable multi-select list. Children should be `<CheckListItem>` elements. */
export function CheckList({ children, className }: CheckListProps) {
  return <ul className={['ds-check-list', className].filter(Boolean).join(' ')}>{children}</ul>;
}

export type CheckListItemProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
};

/** One row in a `<CheckList>` — uses shared `.ds-checkbox` skin. */
export function CheckListItem({
  checked,
  onChange,
  children,
  disabled,
  className,
}: CheckListItemProps) {
  return (
    <li className={className}>
      <label className="ds-check-list__item">
        <input
          type="checkbox"
          className="ds-checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="ds-check-list__label">{children}</span>
      </label>
    </li>
  );
}
