import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import { INPUT_TYPES, type FlowDraft, type InputField, type InputType } from './logicFlow';

/**
 * The inputs board — the first thing AIP Logic puts on screen, and the thing this editor was missing.
 *
 * Rows come from the prompts (`{{input.email}}` creates `email`), so nothing has to be declared twice, but they are
 * visible, typed and documented here rather than inferred invisibly: the run panel is generated from exactly this.
 */
export function LogicInputsBoard({
  draft,
  unused,
  objectTypes,
  disabled,
  onChange,
}: {
  draft: FlowDraft;
  unused: string[];
  /** Object types an `object` input may point at (api names). */
  objectTypes: string[];
  disabled: boolean;
  onChange: (next: FlowDraft) => void;
}) {
  const { t } = useTranslation('ontology');

  const patch = (index: number, changes: Partial<InputField>) => {
    onChange({
      ...draft,
      inputs: draft.inputs.map((field, i) => (i === index ? { ...field, ...changes } : field)),
    });
  };

  return (
    <section className="logic-inputs" aria-label={t('editor.logicInputs')}>
      <div className="logic-inputs__head">
        <h3 className="logic-inputs__title">{t('editor.logicInputs')}</h3>
        <span className="logic-inputs__hint">{t('editor.logicInputsHint')}</span>
      </div>

      {draft.inputs.length === 0 ? (
        <p className="logic-inputs__empty">{t('editor.logicInputsEmpty')}</p>
      ) : (
        <table className="ds-table logic-inputs__table">
          <thead>
            <tr>
              <th>{t('editor.logicFieldName')}</th>
              <th>{t('editor.logicFieldType')}</th>
              <th>{t('editor.logicFieldDescription')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {draft.inputs.map((field, index) => {
              const isUnused = unused.includes(field.name.trim());
              return (
                <tr key={`${field.name}-${index}`} className={isUnused ? 'logic-inputs__row--unused' : undefined}>
                  <td>
                    <input
                      className="ds-control"
                      value={field.name}
                      aria-label={t('editor.logicFieldName')}
                      onChange={(e) => patch(index, { name: e.target.value })}
                      disabled={disabled}
                    />
                    {field.type === 'object' && !field.objectType ? (
                      <span className="logic-inputs__unused">{t('editor.logicInputObjectNeedsType')}</span>
                    ) : null}
                    {isUnused ? (
                      <span className="logic-inputs__unused">{t('editor.logicInputUnused')}</span>
                    ) : null}
                  </td>
                  <td>
                    <select
                      className="ds-control"
                      value={field.type}
                      aria-label={t('editor.logicFieldType')}
                      onChange={(e) => patch(index, { type: e.target.value as InputType })}
                      disabled={disabled}
                    >
                      {INPUT_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {field.type === 'object' ? (
                      <select
                        className="ds-control"
                        value={field.objectType}
                        aria-label={t('editor.logicInputObjectType')}
                        onChange={(e) => patch(index, { objectType: e.target.value })}
                        disabled={disabled}
                      >
                        <option value="">{t('editor.logicToolPickType')}</option>
                        {objectTypes.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                        {field.objectType && !objectTypes.includes(field.objectType) ? (
                          <option value={field.objectType}>{field.objectType}</option>
                        ) : null}
                      </select>
                    ) : (
                    <input
                      className="ds-control"
                      value={field.description}
                      aria-label={t('editor.logicFieldDescription')}
                      onChange={(e) => patch(index, { description: e.target.value })}
                      disabled={disabled}
                    />
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="ds-table-icon-link"
                      aria-label={t('shared.delete')}
                      onClick={() => onChange({ ...draft, inputs: draft.inputs.filter((_, i) => i !== index) })}
                      disabled={disabled}
                    >
                      <Trash2 size={14} aria-hidden />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
