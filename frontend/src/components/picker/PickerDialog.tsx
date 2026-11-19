import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog } from '../../styles/design-system';
import './Picker.scss';

/**
 * A modal that picks resources: an optional rail (a channel tree, a facet list), a body, and a footer that
 * confirms. Two pickers had grown this shape separately, each with its own scroll box, its own empty state
 * and its own padding hacks against `<Dialog>`; the layout lives here once.
 */
export function PickerDialog({
  open,
  title,
  onClose,
  closeDisabled,
  size = 'lg',
  footer,
  rail,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  closeDisabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  footer?: ReactNode;
  /** A left column that filters the list (omit for a flat picker). */
  rail?: ReactNode;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      closeDisabled={closeDisabled}
      title={title}
      size={size}
      footer={footer}
    >
      <div className="picker">
        {rail ? <div className="picker__rail">{rail}</div> : null}
        <div className="picker__main">{children}</div>
      </div>
    </Dialog>
  );
}

/** The scrolling list a picker's rows live in. */
export function PickerList({ children }: { children: ReactNode }) {
  return <ul className="picker__rows">{children}</ul>;
}

/** One selectable resource. The caller owns what "leading" shows, because a picked row and an actionable
 *  row are read differently — a check says "included", a button says "do it". */
export function PickerRow({
  name,
  meta,
  leading,
  trailing,
  selected = false,
  disabled = false,
  onClick,
}: {
  name: string;
  meta?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const className = [
    'picker__row',
    selected ? 'is-selected' : '',
    disabled ? 'is-disabled' : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (!onClick) {
    return (
      <div className={className}>
        {leading ? <span className="picker__row-leading">{leading}</span> : null}
        <span className="picker__row-body">
          <span className="picker__row-name">{name}</span>
          {meta ? <span className="picker__row-meta">{meta}</span> : null}
        </span>
        {trailing ? <span className="picker__row-trailing">{trailing}</span> : null}
      </div>
    );
  }

  return (
    <button type="button" className={className} onClick={onClick} disabled={disabled}>
      {leading ? <span className="picker__row-leading">{leading}</span> : null}
      <span className="picker__row-body">
        <span className="picker__row-name">{name}</span>
        {meta ? <span className="picker__row-meta">{meta}</span> : null}
      </span>
      {trailing ? <span className="picker__row-trailing">{trailing}</span> : null}
    </button>
  );
}

/** What the list says when it has nothing to show, or is still fetching it. */
export function PickerState({
  children,
  loading = false,
}: {
  children: ReactNode;
  loading?: boolean;
}) {
  return (
    <div className="picker__state">
      {loading ? <Loader2 size={24} className="picker__spinner" aria-hidden /> : null}
      <p>{children}</p>
    </div>
  );
}

/** Range + prev/next for a picker list; the shared `<Pagination>` carries a page-size control a dialog
 *  has no room for. */
export function PickerPagination({
  range,
  prevLabel,
  nextLabel,
  canPrev,
  canNext,
  onPrev,
  onNext,
}: {
  range: string;
  prevLabel: string;
  nextLabel: string;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="picker__pagination">
      <span className="picker__pagination-range">{range}</span>
      <div className="picker__pagination-btns">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onPrev}
          disabled={!canPrev}
          aria-label={prevLabel}
        >
          ‹
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onNext}
          disabled={!canNext}
          aria-label={nextLabel}
        >
          ›
        </button>
      </div>
    </div>
  );
}
