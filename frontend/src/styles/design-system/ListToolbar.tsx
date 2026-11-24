/**
 * The row above a list's table: search, filters, a view switch — one line, one gap.
 *
 * Seven pages wrote `ds-list-toolbar` by hand (named after the datasets page that first needed
 * it), and their search fields and filters were copied with it. They are one design-system object.
 */
import type { ReactNode } from 'react';
import { Search } from 'lucide-react';
import { useDsFieldId } from './dsFieldId';

export function ListToolbar({ children }: { children: ReactNode }) {
  return <div className="ds-list-toolbar">{children}</div>;
}

/**
 * A search field with its magnifier, sized to match `.ds-control` so it sits on one line with a filter.
 *
 * `compact` is the same field inside a popover: no 36px box and no 200px floor, because a panel is narrower than
 * the toolbar this was measured against. Sharing the pill is what keeps a second copy from drifting — the explorer's
 * scope picker had one whose input sat at its intrinsic width, so typed text scrolled inside a box that never grew.
 */
export function SearchField({
  value,
  onChange,
  label,
  placeholder,
  className,
  disabled,
  autoFocus,
  compact,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Accessible name; also the placeholder when none is given. */
  label: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  compact?: boolean;
}) {
  const id = useDsFieldId('search');
  return (
    <div
      className={['ds-search', compact ? 'ds-search--compact' : '', className]
        .filter(Boolean)
        .join(' ')}
    >
      <Search size={compact ? 14 : 18} aria-hidden />
      <input
        id={id}
        // ds-control-exempt: `.ds-search` styles this input (the field is the pill, not the control)
        type="search"
        aria-label={label}
        placeholder={placeholder ?? label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        autoFocus={autoFocus}
      />
    </div>
  );
}

/** A label and its select on one line: the row is the layout, not the control. */
export function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="ds-filter">
      {label}
      <select className="ds-control" value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </label>
  );
}
