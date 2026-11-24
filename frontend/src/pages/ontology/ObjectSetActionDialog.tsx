import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { OntologyActionTypeResponse } from '../../data/ontologyActionsApi';
import { Dialog, FormField } from '../../styles/design-system';

/** The parameters an action wants from the caller — the object identity is already decided by the selection. */
interface Field {
  name: string;
  type: string;
  description?: string;
}

/** Keys the executor fills itself from the selected object; asking for them would be asking twice. */
const INJECTED = new Set(['id', 'object', 'object_id']);

function fieldsOf(action: OntologyActionTypeResponse): Field[] {
  const properties = (action.input_schema as { properties?: Record<string, unknown> } | null)
    ?.properties;
  if (!properties) return [];
  return Object.entries(properties)
    .filter(([name]) => !INJECTED.has(name))
    .map(([name, raw]) => {
      const spec = (raw ?? {}) as { type?: string; description?: string };
      return { name, type: spec.type ?? 'string', description: spec.description };
    });
}

/**
 * Running an action over the selected objects.
 *
 * The form is built from the action's own input schema rather than a hand-written one per action: the schema is what
 * the executor validates against, so a field that appears here is a field that reaches it. Empty fields are omitted
 * — a modify action patches only what it was given, and sending empty strings would blank them.
 */
export function ObjectSetActionDialog({
  action,
  count,
  busy,
  onClose,
  onSubmit,
}: {
  action: OntologyActionTypeResponse | null;
  count: number;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: Record<string, unknown>) => void;
}) {
  const { t } = useTranslation('explore');
  const [values, setValues] = useState<Record<string, string>>({});
  if (!action) return null;
  const fields = fieldsOf(action);

  const submit = () => {
    const input: Record<string, unknown> = {};
    for (const field of fields) {
      const raw = values[field.name];
      if (raw === undefined || raw === '') continue;
      input[field.name] = field.type === 'number' || field.type === 'integer' ? Number(raw) : raw;
    }
    onSubmit(input);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={action.display_name}
      closeAriaLabel={t('shared.close')}
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t('shared.cancel')}
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
            {t('objectSet.actionRun', { count })}
          </button>
        </>
      }
    >
      {action.description ? (
        <p className="object-set-action-dialog__desc">{action.description}</p>
      ) : null}
      {fields.length === 0 ? (
        <p className="object-set-action-dialog__desc">
          {t('objectSet.actionNoParameters', { count })}
        </p>
      ) : (
        fields.map((field) => (
          <FormField key={field.name} label={field.name} hint={field.description}>
            {field.type === 'boolean' ? (
              <select
                className="ds-control"
                value={values[field.name] ?? ''}
                onChange={(e) =>
                  setValues((current) => ({ ...current, [field.name]: e.target.value }))
                }
              >
                <option value="">{t('objectSet.actionLeaveUnset')}</option>
                <option value="true">{t('shared.yes')}</option>
                <option value="false">{t('shared.no')}</option>
              </select>
            ) : (
              <input
                className="ds-control"
                type={field.type === 'number' || field.type === 'integer' ? 'number' : 'text'}
                value={values[field.name] ?? ''}
                placeholder={t('objectSet.actionLeaveUnset')}
                onChange={(e) =>
                  setValues((current) => ({ ...current, [field.name]: e.target.value }))
                }
              />
            )}
          </FormField>
        ))
      )}
    </Dialog>
  );
}
