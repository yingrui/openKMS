import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Dialog, FormField } from '../../styles/design-system';
import { createObjectType } from '../../data/ontologyApi';
import {
  fetchDatasetMetadata,
  type DatasetResponse,
  type ColumnMetadata,
} from '../../data/datasetsApi';
import {
  createOntologyActionType,
  updateOntologyGroup,
  type OntologyGroupResponse,
} from '../../data/ontologyFunctionsApi';
import {
  ontologyTypeFromColumn,
  PropertiesEditor,
  toPropertyDefs,
  type FormProperty,
} from './objectTypeFormParts';

const STEPS = ['identity', 'schema', 'actions', 'review'] as const;

export const ACTION_TEMPLATES = [
  { id: 'create', apiPrefix: 'create' },
  { id: 'edit', apiPrefix: 'edit' },
  { id: 'delete', apiPrefix: 'delete' },
] as const;

export type ActionTemplateId = (typeof ACTION_TEMPLATES)[number]['id'];

/** Split a display name into alphanumeric word parts. */
function identifierParts(name: string): string[] {
  return name
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);
}

/** camelCase identifier from a display name, e.g. "Create Portfolio" → createPortfolio. */
export function toCamelCaseApiName(name: string, fallback = 'action'): string {
  const parts = identifierParts(name);
  if (parts.length === 0) return fallback;
  const camel = parts
    .map((p, i) => {
      const lower = p.toLowerCase();
      if (i === 0) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join('');
  if (!/^[a-zA-Z]/.test(camel)) return `${fallback}${camel}`.slice(0, 128);
  return camel.slice(0, 128);
}

/** Action type api_name: prefix + PascalCase(object type), e.g. create + Portfolio → createPortfolio. */
export function actionApiName(prefix: string, objectTypeName: string, attempt = 0): string {
  const parts = identifierParts(objectTypeName);
  const pascal = parts
    .map((p) => {
      const lower = p.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join('');
  const base = `${prefix}${pascal || 'Object'}`.slice(0, 110);
  if (attempt === 0) return base;
  return `${base}${attempt}`.slice(0, 128);
}

type Props = {
  open: boolean;
  onClose: () => void;
  groups: OntologyGroupResponse[];
  datasets: DatasetResponse[];
  initialGroupId?: string;
  onCreated: () => void | Promise<void>;
};

export function ObjectTypeCreateWizard({
  open,
  onClose,
  groups,
  datasets,
  initialGroupId = '',
  onCreated,
}: Props) {
  const { t } = useTranslation('ontology');
  const [stepIndex, setStepIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [groupId, setGroupId] = useState('');
  const [isMasterData, setIsMasterData] = useState(false);
  const [datasetId, setDatasetId] = useState('');
  const [properties, setProperties] = useState<FormProperty[]>([]);
  const [keyProperty, setKeyProperty] = useState('');
  const [displayProperty, setDisplayProperty] = useState('');
  const [loadingMetadata, setLoadingMetadata] = useState(false);
  const [selectedActions, setSelectedActions] = useState<Set<ActionTemplateId>>(new Set());

  const savedPropNamesRef = useRef<Set<string> | null>(null);

  const step = STEPS[stepIndex];
  const canNextIdentity = name.trim().length > 0;

  const groupName = useMemo(
    () => groups.find((g) => g.id === groupId)?.display_name,
    [groups, groupId],
  );

  const enabledPropCount = useMemo(
    () => properties.filter((p) => p.name.trim() && p.enabled !== false).length,
    [properties],
  );

  const selectedActionList = useMemo(
    () => ACTION_TEMPLATES.filter((a) => selectedActions.has(a.id)),
    [selectedActions],
  );

  // Reset when opened
  useEffect(() => {
    if (!open) return;
    setStepIndex(0);
    setSubmitting(false);
    setName('');
    setDescription('');
    setGroupId(
      initialGroupId && groups.some((g) => g.id === initialGroupId) ? initialGroupId : '',
    );
    setIsMasterData(false);
    setDatasetId('');
    setProperties([]);
    setKeyProperty('');
    setDisplayProperty('');
    setLoadingMetadata(false);
    setSelectedActions(new Set());
    savedPropNamesRef.current = null;
  }, [open, initialGroupId, groups]);

  useEffect(() => {
    if (!open) return;
    if (!datasetId) {
      setProperties([]);
      savedPropNamesRef.current = null;
      return;
    }
    const enabledNames = savedPropNamesRef.current;
    savedPropNamesRef.current = null;
    let cancelled = false;
    setLoadingMetadata(true);
    fetchDatasetMetadata(datasetId)
      .then((cols: ColumnMetadata[]) => {
        if (cancelled) return;
        const props: FormProperty[] = cols.map((c) => ({
          name: c.column_name,
          type: ontologyTypeFromColumn(c),
          required: !c.is_nullable,
          enabled: enabledNames ? enabledNames.has(c.column_name) : true,
        }));
        setProperties(props);
        setKeyProperty((prev) => (prev ? prev : cols[0]?.column_name || ''));
      })
      .catch((e) => {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : t('objectTypes.loadColumnsFailed'));
          setProperties([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingMetadata(false);
      });
    return () => {
      cancelled = true;
    };
  }, [datasetId, open, t]);

  const toggleAction = (id: ActionTemplateId) => {
    setSelectedActions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const goBack = () => setStepIndex((i) => Math.max(0, i - 1));
  const goNext = () => {
    if (step === 'identity' && !canNextIdentity) return;
    setStepIndex((i) => Math.min(STEPS.length - 1, i + 1));
  };

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    const otName = name.trim();
    try {
      const created = await createObjectType({
        name: otName,
        description: description.trim() || undefined,
        dataset_id: datasetId || undefined,
        properties: toPropertyDefs(properties),
        key_property: keyProperty || undefined,
        is_master_data: isMasterData,
        display_property: displayProperty || undefined,
      });

      if (groupId) {
        const group = groups.find((g) => g.id === groupId);
        if (group) {
          try {
            await updateOntologyGroup(groupId, {
              object_type_ids: [...new Set([...group.object_type_ids, created.id])],
            });
          } catch (e) {
            toast.error(e instanceof Error ? e.message : t('objectTypes.assignGroupFailed'));
          }
        }
      }

      const failedActions: string[] = [];
      for (const tmpl of selectedActionList) {
        const label = t(`objectTypes.wizard.actionLabel.${tmpl.id}`);
        let createdOk = false;
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            await createOntologyActionType({
              api_name: actionApiName(tmpl.apiPrefix, otName, attempt),
              display_name: t(`objectTypes.wizard.actionDisplay.${tmpl.id}`, { name: otName }),
              description: t(`objectTypes.wizard.actionDescription.${tmpl.id}`, { name: otName }),
              object_type_id: created.id,
              rule_type: 'function',
            });
            createdOk = true;
            break;
          } catch (e) {
            const msg = e instanceof Error ? e.message : '';
            if (msg.toLowerCase().includes('already exists') && attempt < 4) continue;
            break;
          }
        }
        if (!createdOk) failedActions.push(label);
      }

      if (failedActions.length > 0) {
        toast.error(t('objectTypes.wizard.actionsPartialFailed', { names: failedActions.join(', ') }));
      } else {
        toast.success(t('objectTypes.created'));
      }
      onClose();
      await onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('objectTypes.saveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const stepTitle = t(`objectTypes.wizard.steps.${step}`);

  const footer = (
    <>
      <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
        {t('shared.cancel')}
      </button>
      {stepIndex > 0 && (
        <button type="button" className="btn btn-secondary" onClick={goBack} disabled={submitting}>
          {t('objectTypes.wizard.back')}
        </button>
      )}
      {step !== 'review' ? (
        <button
          type="button"
          className="btn btn-primary"
          onClick={goNext}
          disabled={submitting || (step === 'identity' && !canNextIdentity)}
        >
          {t('objectTypes.wizard.next')}
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void handleSubmit()}
          disabled={!canNextIdentity || submitting}
        >
          {submitting ? t('shared.saving') : t('objectTypes.create')}
        </button>
      )}
    </>
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      closeDisabled={submitting}
      title={t('objectTypes.create')}
      closeAriaLabel={t('shared.cancel')}
      size="lg"
      className="object-type-create-dialog"
      footer={footer}
    >
      <div className="object-type-create-wizard">
        <ol className="object-type-create-wizard__steps" aria-label={t('objectTypes.wizard.stepsLabel')}>
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
                {t(`objectTypes.wizard.steps.${id}`)}
              </span>
            </li>
          ))}
        </ol>
        <p className="object-type-create-wizard__current">{stepTitle}</p>

        {step === 'identity' && (
          <div className="object-type-create-form">
            <div
              className={
                groups.length > 0
                  ? 'object-type-create-form__row'
                  : 'object-type-create-form__row object-type-create-form__row--single'
              }
            >
              <FormField label={t('objectTypes.name')}>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Disease"
                  autoFocus
                  disabled={submitting}
                />
              </FormField>
              {groups.length > 0 && (
                <FormField label={t('objectTypes.group')}>
                  <select
                    value={groupId}
                    onChange={(e) => setGroupId(e.target.value)}
                    disabled={submitting}
                    title={t('objectTypes.groupHint')}
                  >
                    <option value="">{t('objectTypes.groupNone')}</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.display_name}
                      </option>
                    ))}
                  </select>
                </FormField>
              )}
            </div>
            <FormField label={t('objectTypes.description')}>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={submitting}
              />
            </FormField>
            <label
              className="object-type-create-wizard__checkbox"
              title={t('objectTypes.masterDataHint')}
            >
              <input
                type="checkbox"
                className="ds-checkbox"
                checked={isMasterData}
                onChange={(e) => setIsMasterData(e.target.checked)}
                disabled={submitting}
              />
              <span>{t('objectTypes.masterData')}</span>
            </label>
          </div>
        )}

        {step === 'schema' && (
          <div className="object-type-create-form">
            <FormField label={t('objectTypes.dataset')}>
              <select
                value={datasetId}
                onChange={(e) => setDatasetId(e.target.value)}
                disabled={submitting}
                title={t('objectTypes.datasourcesHint')}
              >
                <option value="">{t('objectTypes.none')}</option>
                {datasets.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.display_name || `${d.schema_name}.${d.table_name}`}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label={t('objectTypes.displayProperty')}>
              <select
                value={displayProperty}
                onChange={(e) => setDisplayProperty(e.target.value)}
                disabled={submitting}
              >
                <option value="">{t('objectTypes.none')}</option>
                {properties
                  .filter((p) => p.name.trim() && p.enabled !== false)
                  .map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </FormField>
            <PropertiesEditor
              properties={properties}
              fromDataset={!!datasetId}
              nameTypeReadOnly={false}
              keyProperty={keyProperty}
              loadingMetadata={loadingMetadata}
              onAdd={() =>
                setProperties((prev) => [
                  ...prev,
                  { name: '', type: 'string', required: false, enabled: true },
                ])
              }
              onChange={(idx, p) =>
                setProperties((prev) => {
                  const next = [...prev];
                  next[idx] = p;
                  return next;
                })
              }
              onRemove={(idx) => setProperties((prev) => prev.filter((_, i) => i !== idx))}
              onToggleEnabled={
                datasetId
                  ? (idx, enabled) =>
                      setProperties((prev) => {
                        const next = [...prev];
                        next[idx] = { ...next[idx], enabled };
                        return next;
                      })
                  : undefined
              }
              onKeyPropertyChange={setKeyProperty}
            />
          </div>
        )}

        {step === 'actions' && (
          <div className="object-type-create-form">
            <p className="console-modal-hint">{t('objectTypes.wizard.actionsHint')}</p>
            <ul className="object-type-create-wizard__action-list">
              {ACTION_TEMPLATES.map((tmpl) => (
                <li key={tmpl.id}>
                  <label className="object-type-create-wizard__checkbox">
                    <input
                      type="checkbox"
                      className="ds-checkbox"
                      checked={selectedActions.has(tmpl.id)}
                      onChange={() => toggleAction(tmpl.id)}
                      disabled={submitting}
                    />
                    <span>{t(`objectTypes.wizard.actionLabel.${tmpl.id}`)}</span>
                  </label>
                  <span className="console-modal-hint console-modal-hint--block">
                    {t(`objectTypes.wizard.actionHint.${tmpl.id}`)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {step === 'review' && (
          <div className="object-type-create-wizard__review">
            <dl>
              <div>
                <dt>{t('objectTypes.name')}</dt>
                <dd>{name.trim() || '—'}</dd>
              </div>
              <div>
                <dt>{t('objectTypes.description')}</dt>
                <dd>{description.trim() || t('objectTypes.noDescription')}</dd>
              </div>
              {groups.length > 0 && (
                <div>
                  <dt>{t('objectTypes.group')}</dt>
                  <dd>{groupName || t('objectTypes.groupNone')}</dd>
                </div>
              )}
              <div>
                <dt>{t('objectTypes.masterData')}</dt>
                <dd>{isMasterData ? t('objectTypes.wizard.yes') : t('objectTypes.wizard.no')}</dd>
              </div>
              <div>
                <dt>{t('objectTypes.dataset')}</dt>
                <dd>
                  {datasetId
                    ? datasets.find((d) => d.id === datasetId)?.display_name ||
                      datasets.find((d) => d.id === datasetId)?.table_name ||
                      datasetId
                    : t('objectTypes.none')}
                </dd>
              </div>
              <div>
                <dt>{t('objectTypes.properties')}</dt>
                <dd>{t('objectTypes.wizard.propertyCount', { count: enabledPropCount })}</dd>
              </div>
              <div>
                <dt>{t('objectTypes.displayProperty')}</dt>
                <dd>{displayProperty || t('objectTypes.none')}</dd>
              </div>
              <div>
                <dt>{t('objectTypes.wizard.actionsToCreate')}</dt>
                <dd>
                  {selectedActionList.length === 0
                    ? t('objectTypes.wizard.noActions')
                    : selectedActionList
                        .map((a) => t(`objectTypes.wizard.actionLabel.${a.id}`))
                        .join(', ')}
                </dd>
              </div>
            </dl>
          </div>
        )}
      </div>
    </Dialog>
  );
}
