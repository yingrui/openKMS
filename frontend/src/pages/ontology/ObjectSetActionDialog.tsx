import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ActionApplicability } from '../../data/ontologyActionsApi';
import { Dialog, FormField } from '../../styles/design-system';
import { ObjectRefPicker, type ObjectRefSpec } from './ObjectRefPicker';
import {
  refOptionsFromSelection,
  refPrefillFromSelection,
  type SelectionRow,
} from './actionRefPrefill';

/** The parameters an action wants from the caller — the object identity is already decided by the selection. */
interface Field {
  name: string;
  type: string;
  description?: string;
  /** A parameter the action pins to one value: it is sent, never asked. */
  fixed?: unknown;
  /** The only values the action accepts — a free-text box here would invite a refusal. */
  choices?: string[];
  /** A parameter that is another object: picked, not typed. */
  objectRef?: ObjectRefSpec;
}

/** Keys the executor fills itself from the selected object; asking for them would be asking twice. */
const INJECTED = new Set(['id', 'object', 'object_id']);

/** Parameters an action declares as "a property of the object": the selection answers them. */
function objectParamsOf(action: ActionApplicability): Set<string> {
  const raw = (action.parameters as { object_params?: Record<string, string> } | null)?.object_params;
  return new Set(Object.keys(raw ?? {}));
}

function fieldsOf(action: ActionApplicability): Field[] {
  const properties = (action.input_schema as { properties?: Record<string, unknown> } | null)
    ?.properties;
  if (!properties) return [];
  const answered = objectParamsOf(action);
  return Object.entries(properties)
    .filter(([name]) => !INJECTED.has(name) && !answered.has(name))
    .map(([name, raw]) => {
      const spec = (raw ?? {}) as {
        type?: string;
        description?: string;
        const?: unknown;
        enum?: string[];
        object_ref?: ObjectRefSpec;
      };
      return {
        name,
        type: spec.type ?? 'string',
        description: spec.description,
        fixed: spec.const,
        choices: spec.enum,
        objectRef: spec.object_ref,
      };
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
  selectionTypeId,
  selection,
  onClose,
  onSubmit,
}: {
  action: ActionApplicability | null;
  count: number;
  busy: boolean;
  /** The type the ticked rows belong to, and the rows themselves — a reference parameter is usually about them. */
  selectionTypeId: string;
  selection: SelectionRow[];
  onClose: () => void;
  onSubmit: (input: Record<string, unknown>) => void;
}) {
  const { t } = useTranslation('explore');
  /* One ticked object answers a single-valued reference, so the form opens already holding it. Several do not: the
     picker lists them and the reader says which. */
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const field of action ? fieldsOf(action) : []) {
      if (!field.objectRef || field.objectRef.many) continue;
      const picked = refPrefillFromSelection(field.objectRef, selectionTypeId, selection);
      if (picked) initial[field.name] = picked.value;
    }
    return initial;
  });
  /* A list-valued reference keeps its own state: adding one more must not replace the three already chosen. */
  const [refLists, setRefLists] = useState<Record<string, string[]>>(() => {
    const initial: Record<string, string[]> = {};
    for (const field of action ? fieldsOf(action) : []) {
      if (!field.objectRef?.many) continue;
      const picked = refOptionsFromSelection(field.objectRef, selectionTypeId, selection);
      if (picked.length > 0) initial[field.name] = picked.map((option) => option.value);
    }
    return initial;
  });
  if (!action) return null;
  const fields = fieldsOf(action).filter((field) => field.fixed === undefined);
  const hasFixed = fieldsOf(action).some((field) => field.fixed !== undefined);

  const submit = () => {
    const input: Record<string, unknown> = {};
    for (const field of fields) {
      if (field.objectRef?.many) {
        const list = refLists[field.name] ?? [];
        if (list.length > 0) input[field.name] = list;
        continue;
      }
      if (field.fixed !== undefined) {
        input[field.name] = field.fixed;
        continue;
      }
      const raw = values[field.name];
      if (raw === undefined || raw === '') continue;
      if (field.type === 'object') {
        try {
          input[field.name] = JSON.parse(raw);
        } catch {
          // A value that is not JSON is sent as text: the action's own validation will say what it wanted.
          input[field.name] = raw;
        }
        continue;
      }
      input[field.name] =
        field.type === 'number' || field.type === 'integer'
          ? Number(raw)
          : field.type === 'boolean'
            ? raw === 'true'
            : raw;
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
            {count <= 1 && fields.length === 0
              ? t('objectSet.actionRunOnce')
              : t('objectSet.actionRun', { count })}
          </button>
        </>
      }
    >
      {action.description ? (
        <p className="object-set-action-dialog__desc">{action.description}</p>
      ) : null}
      {hasFixed ? (
        <p className="object-set-action-dialog__desc">{t('objectSet.actionFixedParams')}</p>
      ) : null}
      {fields.length === 0 ? (
        <p className="object-set-action-dialog__desc">
          {count <= 1 && !hasFixed
            ? t('objectSet.actionNoParametersOnce')
            : t('objectSet.actionNoParameters', { count })}
        </p>
      ) : (
        fields.map((field) => (
          <FormField key={field.name} label={field.name} hint={field.description}>
            {field.objectRef ? (
              <ObjectRefPicker
                spec={field.objectRef}
                value={values[field.name] ?? ''}
                values={refLists[field.name] ?? []}
                onToggle={(picked) =>
                  setRefLists((current) => {
                    const list = current[field.name] ?? [];
                    return {
                      ...current,
                      [field.name]: list.includes(picked.value)
                        ? list.filter((entry) => entry !== picked.value)
                        : [...list, picked.value],
                    };
                  })
                }
                label={field.name}
                selected={refOptionsFromSelection(field.objectRef, selectionTypeId, selection)}
                onChange={(picked) =>
                  setValues((current) => ({
                    ...current,
                    [field.name]: picked?.value ?? '',
                  }))
                }
              />
            ) : field.choices && field.choices.length > 0 ? (
              <select
                className="ds-control"
                value={values[field.name] ?? ''}
                onChange={(e) =>
                  setValues((current) => ({ ...current, [field.name]: e.target.value }))
                }
              >
                <option value="">{t('objectSet.actionLeaveUnset')}</option>
                {field.choices.map((choice) => (
                  <option key={choice} value={choice}>
                    {choice}
                  </option>
                ))}
              </select>
            ) : field.type === 'object' ? (
              <textarea
                className="ds-control"
                rows={3}
                value={values[field.name] ?? ''}
                placeholder={t('objectSet.actionJsonValue')}
                onChange={(e) =>
                  setValues((current) => ({ ...current, [field.name]: e.target.value }))
                }
              />
            ) : field.type === 'boolean' ? (
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
