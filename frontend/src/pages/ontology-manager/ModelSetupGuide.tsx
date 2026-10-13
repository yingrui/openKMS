import { useTranslation } from 'react-i18next';
import { Check, X } from 'lucide-react';

type Step = {
  key: string;
  label: string;
  hint: string;
  done: boolean;
  optional?: boolean;
  actionLabel: string;
  action: () => void;
};

/**
 * Model tab → guided setup: walks the user from raw datasets to a usable
 * semantic model (datasets → relationships → metrics, then optional queries),
 * with a status per step and a direct action for the next one.
 */
export function ModelSetupGuide({
  datasets,
  relationships,
  metrics,
  queries,
  onAddDatasets,
  onConnectDatasets,
  onAddMetric,
  onAddQuery,
  onExport,
  onDismiss,
}: {
  datasets: number;
  relationships: number;
  metrics: number;
  queries: number;
  onAddDatasets: () => void;
  onConnectDatasets: () => void;
  onAddMetric: () => void;
  onAddQuery: () => void;
  onExport: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation('ontology');

  const steps: Step[] = [
    {
      key: 'datasets',
      label: t('dataModel.setupStepDatasets'),
      hint: t('dataModel.setupStepDatasetsHint'),
      done: datasets > 0,
      actionLabel: t('dataModel.setupEditModel'),
      action: onAddDatasets,
    },
    {
      key: 'relationships',
      label: t('dataModel.setupStepRelationships'),
      hint: t('dataModel.setupStepRelationshipsHint'),
      done: relationships > 0,
      actionLabel: t('dataModel.setupConnect'),
      action: onConnectDatasets,
    },
    {
      key: 'metrics',
      label: t('dataModel.setupStepMetrics'),
      hint: t('dataModel.setupStepMetricsHint'),
      done: metrics > 0,
      actionLabel: t('dataModel.setupAddMetric'),
      action: onAddMetric,
    },
    {
      key: 'queries',
      label: t('dataModel.setupStepQueries'),
      hint: t('dataModel.setupStepQueriesHint'),
      done: queries > 0,
      optional: true,
      actionLabel: t('dataModel.setupAddQuery'),
      action: onAddQuery,
    },
  ];

  const core = steps.filter((s) => !s.optional);
  const doneCount = core.filter((s) => s.done).length;
  const allDone = core.every((s) => s.done);
  const currentIndex = steps.findIndex((s) => !s.done && !s.optional);

  return (
    <section className="model-setup">
      <div className="model-setup__head">
        <div>
          <h2>{t('dataModel.setupTitle')}</h2>
          <p className="page-subtitle">{t('dataModel.setupHint')}</p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onDismiss}>
          <X size={14} aria-hidden />
          {t('dataModel.setupHide')}
        </button>
      </div>

      <p className="model-setup__progress">
        {t('dataModel.setupProgress', { done: doneCount, total: core.length })}
      </p>

      <ol className="model-setup__steps">
        {steps.map((step, i) => {
          const isCurrent = i === currentIndex;
          const showAction = !step.done && (isCurrent || step.optional);
          return (
            <li
              key={step.key}
              className={`model-setup__step${step.done ? ' is-done' : ''}${isCurrent ? ' is-current' : ''}`}
            >
              <span className="model-setup__marker" aria-hidden>
                {step.done ? <Check size={14} /> : i + 1}
              </span>
              <div className="model-setup__body">
                <div className="model-setup__label">
                  {step.label}
                  {step.optional ? (
                    <span className="model-setup__optional">{t('dataModel.setupOptional')}</span>
                  ) : null}
                </div>
                <div className="model-setup__hint">{step.hint}</div>
              </div>
              {showAction ? (
                <button
                  type="button"
                  className={`btn btn-sm ${isCurrent ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={step.action}
                >
                  {step.actionLabel}
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>

      {allDone ? (
        <div className="model-setup__footer">
          <span>{t('dataModel.setupDone')}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onExport}>
            {t('dataModel.setupExport')}
          </button>
        </div>
      ) : null}
    </section>
  );
}
