import type { ReactNode } from 'react';

/**
 * One row for everything that describes *state*: severity, status, and when it happened.
 *
 * The recurring layout mistake this exists for: state-like facts end up in separate cells or separate
 * definition-list rows, so the reader has to assemble "P1 / open / 10:42" from three places. Any list or
 * header that shows severity, status and a timestamp renders them through this, in one order, wrapping as a
 * unit.
 */
export function StatusLine({
  children,
  className,
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span className={['ds-status-line', className].filter(Boolean).join(' ')} title={title}>
      {children}
    </span>
  );
}

/** Muted text inside a status line (a period, a run time) — never a chip. */
export function StatusLineNote({ children }: { children: ReactNode }) {
  return <span className="ds-status-line__note">{children}</span>;
}
