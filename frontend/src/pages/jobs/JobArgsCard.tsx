import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText } from 'lucide-react';

/** An argument's value, shown as it is: a list reads as a list, everything else by its own text. */
function renderValue(value: unknown): ReactNode {
  if (value === null || value === undefined) return <span className="job-detail-mono">null</span>;
  if (Array.isArray(value)) {
    return <span className="job-detail-mono">{value.length === 0 ? '[]' : value.map((v) => String(v)).join(', ')}</span>;
  }
  if (typeof value === 'object') {
    return <span className="job-detail-mono">{JSON.stringify(value)}</span>;
  }
  return String(value);
}

/**
 * What a job was asked to do: its task, its queue, and its arguments as `name: value`.
 *
 * Deliberately not translated per task. The argument names are the API's names — `item_ids`, `language`, `run_id` — and a
 * reader debugging a job is better served by the name the job actually carries than by a second vocabulary that has to be
 * kept in step with it. The only words here are the card's own.
 */
export function JobArgsCard({
  taskName,
  queueName,
  args,
}: {
  taskName: string;
  queueName: string;
  args: Record<string, unknown>;
}) {
  const { t } = useTranslation('workspace');
  const rows: { name: string; value: ReactNode }[] = [
    { name: 'task_name', value: <span className="job-detail-mono">{taskName}</span> },
    { name: 'queue_name', value: <span className="job-detail-mono">{queueName}</span> },
    ...Object.entries(args).map(([name, value]) => ({ name, value: renderValue(value) })),
  ];

  return (
    <section className="job-detail-card">
      <h2>
        <FileText size={18} /> {t('jobDetail.arguments')}
      </h2>
      <p className="job-detail-hint">{t('jobDetail.argumentsHint')}</p>
      <dl className="job-detail-dl">
        {rows.map((row) => (
          <div key={row.name} className="job-detail-arg-row">
            <dt className="job-detail-mono">{row.name}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
