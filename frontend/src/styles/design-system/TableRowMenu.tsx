import { MoreHorizontal } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export type TableRowMenuItem = {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  /** Renders in the error colour: deleting is not the same weight as pausing. */
  danger?: boolean;
  disabled?: boolean;
};

type TableRowMenuProps = {
  /** Accessible name of the trigger, e.g. "Actions for 量化投研专家". */
  label: string;
  items: TableRowMenuItem[];
};

/**
 * A row's actions, folded into one `⋯`.
 *
 * The list is a place to browse, so its rows carry no destructive icon of their own: delete and pause are one
 * click away instead of always on screen. Open state lives here — a menu that only appears on hover is a hidden
 * action, and a menu that never says whether it is open is unreadable to a screen reader.
 */
export function TableRowMenu({ label, items }: TableRowMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  /**
   * Rendered in a portal at fixed coordinates: a row menu inside a scrolling table, and this one inside the detail
   * rail, would otherwise be clipped by the nearest `overflow: hidden` — a menu that opens off-screen is closed.
   *
   * Measured when it opens, not in an effect: the height is only known after the first paint, so the menu places
   * itself from an estimate and the browser clamps it (`max-height` + scroll in the stylesheet).
   */
  const place = () => {
    const trigger = wrapRef.current?.getBoundingClientRect();
    if (!trigger) return;
    const width = 200;
    const left = Math.min(Math.max(8, trigger.right - width), window.innerWidth - width - 8);
    const below = trigger.bottom + 4;
    const top = below + 8 * 40 > window.innerHeight - 8 ? Math.max(8, trigger.top - 8 * 40) : below;
    setPosition({ top, left });
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!wrapRef.current?.contains(target) && !listRef.current?.contains(target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    // A fixed-position menu does not follow the page: close rather than drift.
    const onScroll = () => setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  return (
    <div className="ds-row-menu" ref={wrapRef}>
      <button
        type="button"
        className="ds-table-row-action ds-row-menu__trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        onClick={(e) => {
          e.stopPropagation();
          if (!open) place();
          setOpen((prev) => !prev);
        }}
      >
        <MoreHorizontal size={16} aria-hidden />
      </button>
      {open
        ? createPortal(
            <div
              ref={listRef}
              className="ds-row-menu__list ds-row-menu__list--floating"
              role="menu"
              style={position ? { top: position.top, left: position.left } : { visibility: 'hidden' }}
            >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={['ds-row-menu__item', item.danger && 'ds-row-menu__item--danger']
                .filter(Boolean)
                .join(' ')}
              disabled={item.disabled}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
