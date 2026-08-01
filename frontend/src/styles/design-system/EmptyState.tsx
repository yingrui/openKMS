import type { ReactNode } from 'react';

export type EmptyStateProps = {
  icon?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  /** Larger padding for full-page empty (vs in-table empty). */
  variant?: 'panel' | 'page';
};

/** Shared empty / zero-results panel. Prefer over per-page *-empty markup. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  variant = 'panel',
}: EmptyStateProps) {
  return (
    <div
      className={[
        'ds-empty-state',
        variant === 'page' ? 'ds-empty-state--page' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {icon != null ? <div className="ds-empty-state__icon">{icon}</div> : null}
      {title != null ? <h2 className="ds-empty-state__title">{title}</h2> : null}
      {description != null ? <p className="ds-empty-state__description">{description}</p> : null}
      {action != null ? <div className="ds-empty-state__action">{action}</div> : null}
    </div>
  );
}
