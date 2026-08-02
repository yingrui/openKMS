import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Dialog, FormField } from '../../styles/design-system';
import type { ObjectTypeResponse } from '../../data/ontologyApi';
import {
  createOntologyActionType,
  type OntologyFunctionResponse,
} from '../../data/ontologyFunctionsApi';
import {
  ACTION_TEMPLATES,
  actionApiName,
  toCamelCaseApiName,
  type ActionTemplateId,
} from './ObjectTypeCreateWizard';

const STEPS = ['target', 'define', 'review'] as const;

type IntentId = ActionTemplateId | 'custom';

type Props = {
  open: boolean;
  onClose: () => void;
  objectTypes: ObjectTypeResponse[];
  publishedFunctions: OntologyFunctionResponse[];
  onCreated: () => void | Promise<void>;
};

function deriveApiName(intent: IntentId, objectTypeName: string, displayName: string): string {
  if (intent === 'custom') {
    return toCamelCaseApiName(displayName || 'action');
  }
  const prefix = ACTION_TEMPLATES.find((t) => t.id === intent)?.apiPrefix ?? intent;
  return actionApiName(prefix, objectTypeName || 'Object');
}

export function ActionTypeCreateWizard({
  open,
  onClose,
  objectTypes,
  publishedFunctions,
  onCreated,
}: Props) {
  const { t } = useTranslation('ontology');
  const [stepIndex, setStepIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [objectTypeId, setObjectTypeId] = useState('');
  const [intent, setIntent] = useState<IntentId>('custom');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [functionId, setFunctionId] = useState('');
  const [apiName, setApiName] = useState('');
  const [displayNameTouched, setDisplayNameTouched] = useState(false);
  const [descriptionTouched, setDescriptionTouched] = useState(false);
  const [apiNameTouched, setApiNameTouched] = useState(false);

  const step = STEPS[stepIndex];

  const selectedOt = useMemo(
    () => objectTypes.find((ot) => ot.id === objectTypeId),
    [objectTypes, objectTypeId],
  );

  const selectedFn = useMemo(
    () => publishedFunctions.find((fn) => fn.id === functionId),
    [publishedFunctions, functionId],
  );

  const canNextTarget = !!objectTypeId;
  const canNextDefine = displayName.trim().length > 0;
  const canSubmit = canNextTarget && canNextDefine && apiName.trim().length > 0;

  // Reset when opened
  useEffect(() => {
    if (!open) return;
    setStepIndex(0);
    setSubmitting(false);
    setObjectTypeId(objectTypes[0]?.id ?? '');
    setIntent('custom');
    setDisplayName('');
    setDescription('');
    setFunctionId('');
    setApiName('');
    setDisplayNameTouched(false);
    setDescriptionTouched(false);
    setApiNameTouched(false);
  }, [open, objectTypes]);

  // Suggest display name / description from intent + object type (until user edits)
  useEffect(() => {
    if (!open || !selectedOt) return;
    if (!displayNameTouched) {
      if (intent === 'custom') {
        setDisplayName('');
      } else {
        setDisplayName(t(`objectTypes.wizard.actionDisplay.${intent}`, { name: selectedOt.name }));
      }
    }
    if (!descriptionTouched) {
      if (intent === 'custom') {
        setDescription('');
      } else {
        setDescription(
          t(`objectTypes.wizard.actionDescription.${intent}`, { name: selectedOt.name }),
        );
      }
    }
  }, [open, intent, selectedOt, displayNameTouched, descriptionTouched, t]);

  // Derive api_name until user edits it
  useEffect(() => {
    if (!open || apiNameTouched) return;
    setApiName(deriveApiName(intent, selectedOt?.name ?? '', displayName));
  }, [open, intent, selectedOt?.name, displayName, apiNameTouched]);

  const goNext = () => {
    if (step === 'target' && !canNextTarget) {
      toast.error(t('actions.wizard.objectTypeRequired'));
      return;
    }
    if (step === 'define' && !canNextDefine) {
      toast.error(t('actions.formRequired'));
      return;
    }
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  };

  const goBack = () => setStepIndex((i) => Math.max(i - 1, 0));

  const handleSubmit = async () => {
    if (!canSubmit) {
      toast.error(t('actions.formRequired'));
      return;
    }
    setSubmitting(true);
    try {
      await createOntologyActionType({
        api_name: apiName.trim(),
        display_name: displayName.trim(),
        description: description.trim() || undefined,
        object_type_id: objectTypeId,
        rule_type: 'function',
        function_id: selectedFn?.id,
        function_version: selectedFn?.published_version ?? undefined,
      });
      toast.success(t('actions.created'));
      onClose();
      await onCreated();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('actions.createFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const stepTitle = t(`actions.wizard.steps.${step}`);

  const intentLabel =
    intent === 'custom'
      ? t('actions.wizard.intent.custom')
      : t(`objectTypes.wizard.actionLabel.${intent}`);

  const footer = (
    <>
      <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
        {t('shared.cancel')}
      </button>
      {stepIndex > 0 && (
        <button type="button" className="btn btn-secondary" onClick={goBack} disabled={submitting}>
          {t('actions.wizard.back')}
        </button>
      )}
      {step !== 'review' ? (
        <button
          type="button"
          className="btn btn-primary"
          onClick={goNext}
          disabled={
            submitting ||
            (step === 'target' && !canNextTarget) ||
            (step === 'define' && !canNextDefine)
          }
        >
          {t('actions.wizard.next')}
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void handleSubmit()}
          disabled={!canSubmit || submitting}
        >
          {submitting ? t('shared.saving') : t('actions.create')}
        </button>
      )}
    </>
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      closeDisabled={submitting}
      title={t('actions.create')}
      closeAriaLabel={t('shared.cancel')}
      size="lg"
      className="object-type-create-dialog"
      footer={footer}
    >
      <div className="object-type-create-wizard">
        <ol className="object-type-create-wizard__steps" aria-label={t('actions.wizard.stepsLabel')}>
          {STEPS.map((id, i) => (
            <li
              key={id}
              className={[
                'object-type-create-wizard__step',
                i === stepIndex ? 'is-current' : '',
                i < stepIndex ? 'is-done' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span className="object-type-create-wizard__step-num">{i + 1}</span>
              <span className="object-type-create-wizard__step-label">
                {t(`actions.wizard.steps.${id}`)}
              </span>
            </li>
          ))}
        </ol>
        <p className="object-type-create-wizard__current">{stepTitle}</p>

        {step === 'target' && (
          <div className="object-type-create-form">
            <p className="console-modal-hint">{t('actions.wizard.targetHint')}</p>
            <FormField label={t('actions.objectType')}>
              <select
                value={objectTypeId}
                onChange={(e) => setObjectTypeId(e.target.value)}
                disabled={submitting || objectTypes.length === 0}
                autoFocus
              >
                {objectTypes.length === 0 ? (
                  <option value="">{t('actions.noObjectTypes')}</option>
                ) : (
                  objectTypes.map((ot) => (
                    <option key={ot.id} value={ot.id}>
                      {ot.name}
                    </option>
                  ))
                )}
              </select>
            </FormField>
            <fieldset className="object-type-create-wizard__intent" disabled={submitting}>
              <legend>{t('actions.wizard.intentLabel')}</legend>
              <ul className="object-type-create-wizard__action-list">
                {ACTION_TEMPLATES.map((tmpl) => (
                  <li key={tmpl.id}>
                    <label className="object-type-create-wizard__checkbox">
                      <input
                        type="radio"
                        name="action-intent"
                        className="ds-checkbox"
                        checked={intent === tmpl.id}
                        onChange={() => {
                          setIntent(tmpl.id);
                          setDisplayNameTouched(false);
                          setDescriptionTouched(false);
                          setApiNameTouched(false);
                        }}
                      />
                      <span>{t(`objectTypes.wizard.actionLabel.${tmpl.id}`)}</span>
                    </label>
                    <span className="console-modal-hint console-modal-hint--block">
                      {t(`objectTypes.wizard.actionHint.${tmpl.id}`)}
                    </span>
                  </li>
                ))}
                <li>
                  <label className="object-type-create-wizard__checkbox">
                    <input
                      type="radio"
                      name="action-intent"
                      className="ds-checkbox"
                      checked={intent === 'custom'}
                      onChange={() => {
                        setIntent('custom');
                        setDisplayNameTouched(false);
                        setDescriptionTouched(false);
                        setApiNameTouched(false);
                      }}
                    />
                    <span>{t('actions.wizard.intent.custom')}</span>
                  </label>
                  <span className="console-modal-hint console-modal-hint--block">
                    {t('actions.wizard.intent.customHint')}
                  </span>
                </li>
              </ul>
            </fieldset>
          </div>
        )}

        {step === 'define' && (
          <div className="object-type-create-form">
            <FormField label={t('actions.displayName')}>
              <input
                type="text"
                value={displayName}
                onChange={(e) => {
                  setDisplayNameTouched(true);
                  setDisplayName(e.target.value);
                }}
                placeholder={t('actions.displayName')}
                autoFocus
                disabled={submitting}
              />
            </FormField>
            <FormField label={t('actions.description')}>
              <input
                type="text"
                value={description}
                onChange={(e) => {
                  setDescriptionTouched(true);
                  setDescription(e.target.value);
                }}
                disabled={submitting}
              />
            </FormField>
            <FormField label={t('actions.function')}>
              <select
                value={functionId}
                onChange={(e) => setFunctionId(e.target.value)}
                disabled={submitting}
              >
                <option value="">{t('actions.noFunction')}</option>
                {publishedFunctions.map((fn) => (
                  <option key={fn.id} value={fn.id}>
                    {fn.api_name} (v{fn.published_version})
                  </option>
                ))}
              </select>
              {publishedFunctions.length === 0 && (
                <span className="console-modal-hint">{t('actions.publishFirstHint')}</span>
              )}
            </FormField>
          </div>
        )}

        {step === 'review' && (
          <div className="object-type-create-form">
            <div className="object-type-create-wizard__review">
              <dl>
                <div>
                  <dt>{t('actions.objectType')}</dt>
                  <dd>{selectedOt?.name ?? '—'}</dd>
                </div>
                <div>
                  <dt>{t('actions.wizard.intentLabel')}</dt>
                  <dd>{intentLabel}</dd>
                </div>
                <div>
                  <dt>{t('actions.displayName')}</dt>
                  <dd>{displayName.trim() || '—'}</dd>
                </div>
                <div>
                  <dt>{t('actions.description')}</dt>
                  <dd>{description.trim() || t('actions.noDescription')}</dd>
                </div>
                <div>
                  <dt>{t('actions.function')}</dt>
                  <dd>
                    {selectedFn
                      ? `${selectedFn.api_name} (v${selectedFn.published_version})`
                      : t('actions.noFunction')}
                  </dd>
                </div>
              </dl>
            </div>
            <FormField label={t('actions.apiName')} hint={t('actions.wizard.apiNameHint')}>
              <input
                type="text"
                value={apiName}
                onChange={(e) => {
                  setApiNameTouched(true);
                  setApiName(e.target.value);
                }}
                disabled={submitting}
              />
            </FormField>
          </div>
        )}
      </div>
    </Dialog>
  );
}
