import { useTranslation } from 'react-i18next';
import { Loader2, Play } from 'lucide-react';
import { FormField } from '../../styles/design-system';
import { ObjectInstancePicker, type PickedInstance } from './ObjectInstancePicker';
import type { InputField } from './logicFlow';

/**
 * Run a Logic function's draft: one field per `{{input.x}}` the prompts mention.
 *
 * The first version made people type a JSON object to test a prompt — a second, hand-written model of the inputs they
 * had already named in the text. The fields here come from the draft, so the run panel cannot disagree with it.
 */
export function LogicRunPanel({
  fields,
  values,
  picked,
  objectTypeIds,
  running,
  canRun,
  recent,
  onChange,
  onPick,
  onRun,
  onSelectRun,
}: {
  fields: InputField[];
  values: Record<string, string>;
  /** Object and object-set inputs are picked as records, not typed as JSON. */
  picked: Record<string, PickedInstance[]>;
  /** api_name → id, so the picker can search the right type. */
  objectTypeIds: Record<string, string>;
  running: boolean;
  canRun: boolean;
  /** The last few runs, newest first: a refresh should not erase the only run you had. */
  recent: {
    id: string;
    created_at: string;
    duration_ms: number | null;
    status: string;
    tokens: number | null;
    draft: boolean;
  }[];
  onChange: (next: Record<string, string>) => void;
  onPick: (name: string, instances: PickedInstance[]) => void;
  onRun: () => void;
  onSelectRun: (runId: string) => void;
}) {
  const { t } = useTranslation('ontology');
  // Which required inputs are still empty: the reason the Run button is disabled, named, instead of a silent no-op.
  const missing = fields
    .filter((field) => {
      if (!field.required) return false;
      if (field.type === 'object' || field.type === 'object_set') {
        return (picked[field.name] ?? []).length === 0;
      }
      return !(values[field.name] ?? '').trim();
    })
    .map((field) => field.name);

  return (
    <section className="logic-run" aria-label={t('editor.logicRunTitle')}>
      <div className="logic-run__head">
        <span className="logic-run__title">{t('editor.logicRunTitle')}</span>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={onRun}
          disabled={!canRun || running || missing.length > 0}
          title={missing.length ? t('editor.logicRunMissing', { names: missing.join(', ') }) : undefined}
        >
          {running ? <Loader2 size={14} className="spin" aria-hidden /> : <Play size={14} aria-hidden />}
          {running ? t('editor.running') : t('editor.logicRunDraft')}
        </button>
      </div>

      <p className="logic-run__hint">{t('editor.logicRunScope')}</p>

      {missing.length ? (
        <p className="logic-run__missing" role="status">
          {t('editor.logicRunMissing', { names: missing.join(', ') })}
        </p>
      ) : null}

      {fields.length === 0 ? (
        <p className="logic-run__hint">{t('editor.logicRunNoInputs')}</p>
      ) : (
        <div className="logic-run__inputs">
          {fields.map((field) =>
            field.type === 'object' || field.type === 'object_set' ? (
              <FormField
                key={field.name}
                label={field.required ? `${field.name} *` : `${field.name} (${t('editor.logicRunOptional')})`}
                htmlFor={`logic-run-${field.name}`}
                hint={t('editor.logicRunObjectHint')}
              >
                {objectTypeIds[field.objectType] ? (
                  <ObjectInstancePicker
                    objectTypeId={objectTypeIds[field.objectType]}
                    objectTypeName={field.objectType}
                    picked={picked[field.name] ?? []}
                    multiple={field.type === 'object_set'}
                    disabled={running}
                    onPick={(instances) => onPick(field.name, instances)}
                  />
                ) : (
                  <p className="logic-run__hint">
                    {t('editor.logicRunUnknownType', { type: field.objectType })}
                  </p>
                )}
              </FormField>
            ) : (
              <FormField
                key={field.name}
                label={field.required ? `${field.name} *` : `${field.name} (${t('editor.logicRunOptional')})`}
                htmlFor={`logic-run-${field.name}`}
                hint={t('editor.logicRunInputHint')}
              >
                <input
                  id={`logic-run-${field.name}`}
                  className="ds-control"
                  value={values[field.name] ?? ''}
                  onChange={(e) => onChange({ ...values, [field.name]: e.target.value })}
                  disabled={running}
                />
              </FormField>
            ),
          )}
        </div>
      )}

      {recent.length ? (
        <details className="logic-run__recent">
          <summary>{t('editor.logicRecentRuns', { count: recent.length })}</summary>
          <ul>
            {recent.map((run) => (
              <li key={run.id}>
                <button type="button" className="logic-run__recent-row" onClick={() => onSelectRun(run.id)}>
                  <span className={`logic-run__dot logic-run__dot--${run.status === 'ok' ? 'ok' : 'fail'}`} />
                  <span>{new Date(run.created_at).toLocaleString()}</span>
                  {run.draft ? <span className="logic-run__draft">{t('editor.logicRunDraftTag')}</span> : null}
                  <span className="logic-run__recent-meta">
                    {run.tokens ? t('editor.logicRunTokens', { tokens: run.tokens }) : ''}
                    {run.duration_ms != null ? ` · ${run.duration_ms} ms` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
