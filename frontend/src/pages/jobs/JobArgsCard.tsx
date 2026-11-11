import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { FileText } from 'lucide-react';
import type { TFunction } from 'i18next';

/** A label and its value, already rendered. */
interface Row {
  label: string;
  value: ReactNode;
}

/** Route for an argument that names something the app can open, keyed by the argument. */
const RESOURCE_LINKS: Record<string, (args: Record<string, unknown>) => string | null> = {
  // An evaluation run is addressed by both ids: the dataset page plus `?run=` selects the run.
  run_id: (args) => {
    const evaluationId = String(args.evaluation_id ?? '');
    const runId = String(args.run_id ?? '');
    return evaluationId && runId ? `/evaluations/${evaluationId}?run=${runId}` : null;
  },
};

/** Human labels for the argument keys several tasks share; anything else renders its own key. */
const ARG_LABELS: Record<string, string> = {
  evaluation_id: 'evaluation',
  evaluation_name: 'evaluation',
  evaluation_type: 'evaluationType',
  item_ids: 'evaluationScope',
  item_count: 'evaluationScope',
  language: 'evaluationLanguage',
  run_id: 'evaluationRunLink',
  knowledge_base_id: 'knowledgeBaseId',
  document_id: 'documentId',
  connector_id: 'connectorId',
  wiki_space_id: 'wikiSpaceId',
  project_id: 'projectId',
  trigger_id: 'triggerId',
};

/**
 * Per-task presentation: the same rows the generic view would show, ordered and worded for the task that owns them.
 * Adding a task means adding an entry here — not another card in the page.
 */
const TASK_ROWS: Record<string, (args: Record<string, unknown>, t: TFunction) => Row[]> = {
  run_evaluation: (args, t) => {
    const ids = Array.isArray(args.item_ids) ? (args.item_ids as string[]) : null;
    const rows: Row[] = [
      {
        label: t('jobDetail.evaluation'),
        value: (
          <>
            {String(args.evaluation_name ?? '—')} <span className="job-detail-mono">{String(args.evaluation_id ?? '')}</span>
          </>
        ),
      },
      {
        label: t('jobDetail.evaluationScope'),
        value: (
          <span className="job-detail-mono">
            {ids
              ? ids.length === 0
                ? '—'
                : ids.join(', ')
              : t('jobDetail.evaluationScopeAll', { count: Number(args.item_count) || 0 })}
          </span>
        ),
      },
      { label: t('jobDetail.evaluationType'), value: String(args.evaluation_type ?? '—') },
      { label: t('jobDetail.evaluationLanguage'), value: String(args.language ?? '—') },
    ];
    const link = RESOURCE_LINKS.run_id(args);
    if (link) {
      rows.push({
        label: t('jobDetail.evaluationRunLink'),
        value: (
          <Link to={link} className="job-detail-link">
            {String(args.run_id).slice(0, 8)}…
          </Link>
        ),
      });
    }
    return rows;
  },
};

function genericRows(args: Record<string, unknown>, t: TFunction): Row[] {
  return Object.entries(args).map(([key, value]) => {
    const link = RESOURCE_LINKS[key]?.(args) ?? null;
    return {
      label: ARG_LABELS[key] ? t(`jobDetail.${ARG_LABELS[key]}`) : key,
      value: link ? (
        <Link to={link} className="job-detail-link">
          {String(value).slice(0, 8)}…
        </Link>
      ) : (
        renderValue(value)
      ),
    };
  });
}

/** An argument's value is for a person, not a parser: an array reads as a list, never as JSON. */
function renderValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (Array.isArray(value)) return value.length === 0 ? '—' : value.map((v) => String(v)).join(', ');
  if (typeof value === 'string') return value === '' ? '—' : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/**
 * What a job was asked to do, for any task.
 *
 * The page used to grow a card per task, and this one was the third: a bespoke block for evaluation runs next to a generic
 * "arguments" block that showed the same keys unlabelled. One card now renders both — a task-specific ordering when the
 * task has an entry above, its raw arguments otherwise — so a new task needs no new card, and a reader sees task, queue
 * and parameters in one place.
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
  const rows: Row[] = [
    { label: t('jobDetail.taskName'), value: <span className="job-detail-mono">{taskName}</span> },
    { label: t('jobDetail.queue'), value: queueName },
    ...(taskName in TASK_ROWS ? TASK_ROWS[taskName](args, t) : genericRows(args, t)),
  ];

  return (
    <section className="job-detail-card">
      <h2>
        <FileText size={18} /> {t('jobDetail.arguments')}
      </h2>
      <p className="job-detail-hint">{t('jobDetail.argumentsHint')}</p>
      <dl className="job-detail-dl">
        {rows.map((row) => (
          <div key={row.label} className="job-detail-arg-row">
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
