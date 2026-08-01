import type { ReactNode } from 'react';

export type MetricProps = {
  label: string;
  value: ReactNode;
  /** Allow multi-line values (e.g. linked lists). */
  wrap?: boolean;
  className?: string;
};

export function MetricGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={['ds-metric-grid', className].filter(Boolean).join(' ')}>{children}</div>;
}

export function Metric({ label, value, wrap, className }: MetricProps) {
  return (
    <div className={['ds-metric', className].filter(Boolean).join(' ')}>
      <span className="ds-metric__label">{label}</span>
      <span className={['ds-metric__value', wrap ? 'ds-metric__value--wrap' : ''].filter(Boolean).join(' ')}>
        {value}
      </span>
    </div>
  );
}
