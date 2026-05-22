import { Loader2 } from 'lucide-react';
import type { MouseEvent, ReactNode } from 'react';

/** Class for `<th>` / `<td>` that holds a row action group. */
export const tableRowActionCellClass = 'ds-table-row-action-cell';

type TableRowActionCellProps = {
  children: ReactNode;
  as?: 'td' | 'th';
  className?: string;
  /** Stop click from bubbling to clickable table rows. Default: true for `td`, false for `th`. */
  stopRowClick?: boolean;
};

export function TableRowActionCell({
  children,
  as = 'td',
  className,
  stopRowClick,
}: TableRowActionCellProps) {
  const Tag = as;
  const stop = stopRowClick ?? as === 'td';
  return (
    <Tag
      className={[tableRowActionCellClass, className].filter(Boolean).join(' ')}
      onClick={stop ? (e: MouseEvent) => e.stopPropagation() : undefined}
    >
      {children}
    </Tag>
  );
}

export function TableRowActions({ children }: { children: ReactNode }) {
  return <div className="ds-table-row-actions">{children}</div>;
}

type TableRowActionButtonProps = {
  title: string;
  'aria-label': string;
  icon: ReactNode;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'default' | 'danger';
};

export function TableRowActionButton({
  title,
  'aria-label': ariaLabel,
  icon,
  onClick,
  disabled,
  loading,
  variant = 'default',
}: TableRowActionButtonProps) {
  return (
    <button
      type="button"
      title={title}
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled || loading}
      className={['ds-table-row-action', variant === 'danger' && 'ds-table-row-action--danger']
        .filter(Boolean)
        .join(' ')}
    >
      {loading ? (
        <Loader2 size={16} className="ds-table-row-action__spinner" aria-hidden />
      ) : (
        icon
      )}
    </button>
  );
}

type TableRowActionLinkProps = {
  href: string;
  title: string;
  'aria-label': string;
  icon: ReactNode;
};

export function TableRowActionLink({
  href,
  title,
  'aria-label': ariaLabel,
  icon,
}: TableRowActionLinkProps) {
  return (
    <a
      href={href}
      title={title}
      aria-label={ariaLabel}
      className="ds-table-row-action"
      onClick={(e) => e.stopPropagation()}
    >
      {icon}
    </a>
  );
}
