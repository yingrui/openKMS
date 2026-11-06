import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  deleteDataResource,
  fetchDataResources,
  updateDataResource,
  type DataResourceResponse,
} from '../../data/dataResourcesApi';
import { DataResourceAccessPanel } from '../../components/DataResourceAccessPanel';
import { useConfirm } from '../../contexts/ConfirmContext';
import { FormField } from '../../styles/design-system';
import { EntityViewHeader, EntityViewLoading, EntityViewPanel } from './EntityViewShell';
import { ResourceRowEditor } from './ResourceRowEditor';
import { describePolicy, toDrafts, toPolicy, type RowDraft } from './modelRowPolicy';

/**
 * One data resource: its row conditions and who may read it.
 *
 * The list page used to render every resource's full access panel inline, which made a page that
 * was 90% form. Splitting them means the list answers "what resources exist", and this page
 * answers "what exactly does *this* one allow, and to whom".
 */
export function ModelDataResourceDetail() {
  const { t } = useTranslation('ontology');
  const { modelId = '', resourceId = '' } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();

  const [resource, setResource] = useState<DataResourceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [rows, setRows] = useState<RowDraft[]>([]);
  const [saving, setSaving] = useState(false);

  const base = `/data-model/${modelId}/resources`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await fetchDataResources(modelId);
      const found = page.items.find((r) => r.id === resourceId) ?? null;
      setResource(found);
      if (found) {
        setName(found.name);
        setRows(toDrafts(found.row_policy));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataModel.resourceLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [modelId, resourceId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSave = async () => {
    if (!resource || !name.trim()) return;
    setSaving(true);
    try {
      await updateDataResource(resource.id, {
        name: name.trim(),
        row_policy: toPolicy(rows),
      });
      toast.success(t('dataModel.resourceSaved'));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataModel.resourceSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!resource) return;
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
      navigate(base);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataModel.resourceDeleteFailed'));
    }
  };

  if (loading) {
    return <EntityViewLoading label={t('shared.loading')} />;
  }
  if (!resource) {
    return (
      <div className="ontology-admin">
        <p className="entity-view__readonly">{t('dataModel.resourceNotFound')}</p>
      </div>
    );
  }

  return (
    <>
      <button type="button" className="entity-view__back" onClick={() => navigate(base)}>
        <ArrowLeft size={16} aria-hidden />
        {t('dataModel.resources')}
      </button>

      <EntityViewHeader
        title={resource.name}
        subtitle={
          resource.row_policy.length
            ? describePolicy(resource.row_policy)
            : t('dataModel.resourceRowsNone')
        }
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => void onDelete()}>
              <Trash2 size={16} aria-hidden />
              {t('shared.delete')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving || !name.trim()}
              onClick={() => void onSave()}
            >
              {saving ? t('shared.saving') : t('shared.save')}
            </button>
          </>
        }
      />

      <EntityViewPanel title={t('dataModel.resourceDefinition')}>
        <div className="entity-view__form">
          <FormField label={t('dataModel.resourceName')}>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField label={t('dataModel.resourceRows')} hint={t('dataModel.resourceRowsHint')}>
            <ResourceRowEditor rows={rows} onChange={setRows} />
          </FormField>
        </div>
      </EntityViewPanel>

      {/* Access is a property of this resource, so it lives on the resource's page rather than
          being repeated (and edited) once per row on the list. */}
      <DataResourceAccessPanel
        resourceId={resource.id}
        resourceName={resource.name}
        rowPolicy={resource.row_policy}
      />
    </>
  );
}
