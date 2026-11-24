import { useTranslation } from 'react-i18next';
import { Loader2, Play } from 'lucide-react';
import { FormField } from '../../styles/design-system';

/**
 * Run a Logic function's draft: one field per `{{input.x}}` the prompts mention.
 *
 * The first version made people type a JSON object to test a prompt — a second, hand-written model of the inputs they
 * had already named in the text. The fields here come from the draft, so the run panel cannot disagree with it.
 */
export function LogicRunPanel({
  inputs,
  values,
  running,
  canRun,
  onChange,
  onRun,
}: {
  inputs: string[];
  values: Record<string, string>;
  running: boolean;
  canRun: boolean;
  onChange: (next: Record<string, string>) => void;
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

      {inputs.length === 0 ? (
        <p className="logic-run__hint">{t('editor.logicRunNoInputs')}</p>
      ) : (
        <div className="logic-run__inputs">
          {inputs.map((name) => (
            <FormField key={name} label={name} htmlFor={`logic-run-${name}`} hint={t('editor.logicRunInputHint')}>
              <input
                id={`logic-run-${name}`}
                className="ds-control"
                value={values[name] ?? ''}
                onChange={(e) => onChange({ ...values, [name]: e.target.value })}
                disabled={running}
              />
            </FormField>
          ))}
        </div>
      )}
    </section>
  );
}
