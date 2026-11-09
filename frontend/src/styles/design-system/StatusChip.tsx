import type { ReactNode } from 'react';

/** The tone a status reads as — neutral by default, so a chip never shouts without reason. */
export type StatusTone = 'neutral' | 'accent' | 'ok' | 'warn';

export interface StatusChipProps {
  children: ReactNode;
  tone?: StatusTone;
  className?: string;
  /** The meaning behind a short word ("P2"), for chips whose text is a code. */
  title?: string;
}

/** A short state word as a chip (`ds-status`). Prefer over a page-local pill. */
export function StatusChip({ children, tone = 'neutral', className, title }: StatusChipProps) {
  return (
    <span
      className={['ds-status', tone !== 'neutral' && `ds-status--${tone}`, className].filter(Boolean).join(' ')}
      title={title}
    >
      {children}
    </span>
  );
}
