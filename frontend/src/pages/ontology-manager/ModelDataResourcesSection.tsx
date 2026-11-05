import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  createDataResource,
  deleteDataResource,
  fetchDataResources,
  type DataResourceResponse,
  type RowPolicyCondition,
} from '../../data/dataResourcesApi';
import { RESOURCE_TYPES } from '../../data/resourceAclApi';
import { useConfirm } from '../../contexts/ConfirmContext';
import { FormField } from '../../styles/design-system';
import { ResourceSharePanel } from '../../components/ResourceSharePanel';
import { EntityViewHeader, EntityViewPanel } from './EntityViewShell';
import { useSemanticModelDetail } from './useSemanticModelDetail';
import { datasetLabel } from './datasetLabel';

type Draft = { column: string; op: string; value: string };

const OPS = ['=', '!=', '>', '>=', '<', '<=', 'like', 'in', 'is_null', 'is_not_null'];

/** Turn the row editor's strings into the policy the API validates. */
function toPolicy(rows: Draft[]): RowPolicyCondition[] {
  return rows
    .filter((r) => r.column.trim())
    .map((r) => {
      if (r.op === 'is_null' || r.op === 'is_not_null') {
        return { column: r.column.trim(), op: r.op as RowPolicyCondition['op'] };
      }
      return {
        column: r.column.trim(),
        op: r.op as RowPolicyCondition['op'],
        value:
          r.op === 'in'
            ? r.value.split(',').map((v) => v.trim()).filter(Boolean)
            : r.value,
      };
    });
}

function describe(policy: RowPolicyCondition[]): string {
  return policy
    .map((c) => {
      const right = c.claim ? `claim:${c.claim}` : Array.isArray(c.value) ? c.value.join(', ') : String(c.value ?? '');
      return c.op === 'is_null' || c.op === 'is_not_null' ? `${c.column} ${c.op}` : `${c.column} ${c.op} ${right}`;
    })
    .join(' AND ');
}

/**
 * Model → Data resources: the named slices operators grant in Data Security.
 *
 * A gated model is reachable only through one of these, and a resource's row policy is what
 * the data layer injects — so this page is where "which rows" is decided, and the sharing
 * panel on each row is where "who" is decided.
 */
export function ModelDataResourcesSection() {
  const { t } = useTranslation('ontology');
  const confirm = useConfirm();
  const { model, allDatasets } = useSemanticModelDetail();

  const [resources, setResources] = useState<DataResourceResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [baseDatasetId, setBaseDatasetId] = useState(model.dataset_ids[0] ?? '');
  const [rows, setRows] = useState<Draft[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await fetchDataResources(model.id);
      setResources(page.items);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataModel.resourceLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [model.id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const modelDatasets = allDatasets.filter((d) => model.dataset_ids.includes(d.id));
  const baseLabel = (datasetId: string | null): string => {
    if (!datasetId) return t('dataModel.resourceNoBase');
    const found = allDatasets.find((d) => d.id === datasetId);
    return found ? datasetLabel(found) : datasetId;
  };

  const onCreate = async () => {
    if (!name.trim()) {
      toast.error(t('dataModel.resourceNameRequired'));
      return;
    }
    setSaving(true);
    try {
      await createDataResource({
        name: name.trim(),
        semantic_model_id: model.id,
        base_dataset_id: baseDatasetId || null,
        row_policy: toPolicy(rows),
      });
      setName('');
      setRows([]);
      toast.success(t('dataModel.resourceCreated'));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataModel.resourceCreateFailed'));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (resource: DataResourceResponse) => {
    const ok = await confirm({
      title: t('shared.delete'),
      message: t('dataModel.resourceDeleteConfirm', { name: resource.name }),
      confirmLabel: t('shared.delete'),
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteDataResource(resource.id);
      toast.success(t('dataModel.resourceDeleted'));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataModel.resourceDeleteFailed'));
    }
  };

  return (
    <>
      <EntityViewHeader
        title={t('dataModel.resources')}
        subtitle={t('dataModel.resourcesHint')}
      />

      <EntityViewPanel title={t('dataModel.resourceNew')}>
        <div className="entity-view__form">
          <FormField label={t('dataModel.resourceName')}>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField label={t('dataModel.resourceBaseDataset')} hint={t('dataModel.resourceBaseDatasetHint')}>
            <select value={baseDatasetId} onChange={(e) => setBaseDatasetId(e.target.value)}>
              <option value="">{t('dataModel.resourceNoBase')}</option>
              {modelDatasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {datasetLabel(d)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label={t('dataModel.resourceRows')} hint={t('dataModel.resourceRowsHint')}>
            {rows.map((row, idx) => (
              <div key={idx} className="model-scope-add">
                <input
                  type="text"
                  aria-label={t('dataModel.resourceColumn')}
                  placeholder={t('dataModel.resourceColumn')}
                  value={row.column}
                  onChange={(e) =>
                    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, column: e.target.value } : r)))
                  }
                />
                <select
                  aria-label={t('dataModel.resourceOperator')}
                  value={row.op}
                  onChange={(e) =>
                    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, op: e.target.value } : r)))
                  }
                >
                  {OPS.map((op) => (
                    <option key={op} value={op}>
                      {op}
                    </option>
                  ))}
                </select>
                {row.op !== 'is_null' && row.op !== 'is_not_null' ? (
                  <input
                    type="text"
                    aria-label={t('dataModel.resourceValue')}
                    placeholder={t('dataModel.resourceValue')}
                    value={row.value}
                    onChange={(e) =>
                      setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, value: e.target.value } : r)))
                    }
                  />
                ) : null}
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  aria-label={t('shared.delete')}
                  onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))}
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setRows((prev) => [...prev, { column: '', op: '=', value: '' }])}
            >
              <Plus size={14} aria-hidden />
              {t('dataModel.resourceAddCondition')}
            </button>
          </FormField>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void onCreate()}>
            {saving ? t('shared.saving') : t('dataModel.resourceCreate')}
          </button>
        </div>
      </EntityViewPanel>

      {loading ? <p className="page-subtitle">{t('shared.loading')}</p> : null}

      {resources.map((resource) => (
        <EntityViewPanel key={resource.id} title={resource.name}>
          <div className="entity-view__dl">
            <dt>{t('dataModel.resourceBaseDataset')}</dt>
            <dd>{baseLabel(resource.base_dataset_id)}</dd>
            <dt>{t('dataModel.resourceRows')}</dt>
            <dd>{resource.row_policy.length ? describe(resource.row_policy) : t('dataModel.resourceRowsNone')}</dd>
          </div>
          <div className="model-scope-add">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => void onDelete(resource)}
            >
              <Trash2 size={14} aria-hidden />
              {t('shared.delete')}
            </button>
          </div>
          <ResourceSharePanel
            resourceType={RESOURCE_TYPES.dataResource}
            resourceId={resource.id}
            title={t('dataModel.resourceAccess')}
          />
        </EntityViewPanel>
      ))}
    </>
  );
}
