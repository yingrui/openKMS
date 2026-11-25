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
  onChange,
  onPick,
  onRun,
}: {
  fields: InputField[];
  values: Record<string, string>;
  /** Object inputs are picked as instances, not typed as JSON. */
  picked: Record<string, PickedInstance | null>;
  /** api_name → id, so the picker can search the right type. */
  objectTypeIds: Record<string, string>;
  running: boolean;
  canRun: boolean;
  onChange: (next: Record<string, string>) => void;
  onPick: (name: string, instance: PickedInstance | null) => void;
  onRun: () => void;
}) {
  const { t } = useTranslation('ontology');

  return (
    <section className="logic-run" aria-label={t('editor.livePreview')}>
      <div className="logic-run__head">
        <span className="logic-run__title">{t('editor.livePreview')}</span>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={onRun}
          disabled={!canRun || running}
        >
          {running ? <Loader2 size={14} className="spin" aria-hidden /> : <Play size={14} aria-hidden />}
          {running ? t('editor.running') : t('editor.logicRunDraft')}
        </button>
      </div>

      {fields.length === 0 ? (
        <p className="logic-run__hint">{t('editor.logicRunNoInputs')}</p>
      ) : (
        <div className="logic-run__inputs">
          {fields.map((field) =>
            field.type === 'object' ? (
              <FormField
                key={field.name}
                label={field.name}
                htmlFor={`logic-run-${field.name}`}
                hint={t('editor.logicRunObjectHint')}
              >
                {objectTypeIds[field.objectType] ? (
                  <ObjectInstancePicker
                    objectTypeId={objectTypeIds[field.objectType]}
                    objectTypeName={field.objectType}
                    picked={picked[field.name] ?? null}
                    disabled={running}
                    onPick={(instance) => onPick(field.name, instance)}
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
                label={field.name}
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
    </section>
  );
}
