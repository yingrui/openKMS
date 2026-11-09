import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  createDataResource,
  deleteDataResource,
  fetchDataResources,
  type DataResourceResponse,
} from '../../../data/dataResourcesApi';
import { useConfirm } from '../../../contexts/ConfirmContext';
import { Dialog, FormField } from '../../../styles/design-system/index';
import { EntityViewHeader, EntityViewPanel } from '../../shared/EntityViewShell';
import { ResourceRowEditor } from '../../shared/ResourceRowEditor';
import { describePolicy, toPolicy, type RowDraft } from './modelRowPolicy';
import { useSemanticModelDetail } from './useSemanticModelDetail';

/**
 * Model → Data resources: **the list**.
 *
 * A resource has two things worth looking at — its row conditions and who may read it — and
 * rendering every resource's full access panel inline made a page that was 90% form. This is now
 * a list; editing a resource and managing its readers live on the resource's own page.
 */
export function ModelDataResourcesSection() {
  const { t } = useTranslation('ontology');
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { model } = useSemanticModelDetail();

  const [resources, setResources] = useState<DataResourceResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [rows, setRows] = useState<RowDraft[]>([]);

  const base = `/data-model/${model.id}/resources`;

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

  const resetForm = () => {
    setShowCreate(false);
    setName('');
    setRows([]);
  };

  const onCreate = async () => {
    if (!name.trim()) {
      toast.error(t('dataModel.resourceNameRequired'));
      return;
    }
    setCreating(true);
    try {
      const created = await createDataResource({
        name: name.trim(),
        semantic_model_id: model.id,
        row_policy: toPolicy(rows),
      });
      resetForm();
      toast.success(t('dataModel.resourceCreated'));
      // Straight to the new resource: granting access is the next thing an author does.
      navigate(`${base}/${created.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataModel.resourceCreateFailed'));
    } finally {
      setCreating(false);
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
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={16} aria-hidden />
            {t('dataModel.resourceNew')}
          </button>
        }
      />

      <EntityViewPanel>
        {loading ? (
          <p className="page-subtitle">{t('shared.loading')}</p>
        ) : resources.length === 0 ? (
          <p className="page-subtitle">{t('dataModel.resourceEmpty')}</p>
        ) : (
          <div className="ds-table-wrap ds-table-wrap--flush">
            <table className="console-table">
              <thead>
                <tr>
                  <th>{t('dataModel.resourceName')}</th>
                  <th>{t('dataModel.resourceRows')}</th>
                  <th aria-label={t('shared.delete')} />
                </tr>
              </thead>
              <tbody>
                {resources.map((resource) => (
                  <tr key={resource.id}>
                    <td>
                      <Link to={`${base}/${resource.id}`}>
                        {resource.name}
                        <ChevronRight size={14} aria-hidden />
                      </Link>
                    </td>
                    <td>
                      {resource.row_policy.length ? (
                        <code>{describePolicy(resource.row_policy)}</code>
                      ) : (
                        <span className="page-subtitle">{t('dataModel.resourceRowsNone')}</span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        aria-label={t('shared.delete')}
                        onClick={() => void onDelete(resource)}
                      >
                        <Trash2 size={14} aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </EntityViewPanel>

      <Dialog
        open={showCreate}
        onClose={resetForm}
        closeDisabled={creating}
        title={t('dataModel.resourceNew')}
        size="md"
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={resetForm}
              disabled={creating}
            >
              {t('shared.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!name.trim() || creating}
              onClick={() => void onCreate()}
            >
              {creating ? t('shared.saving') : t('dataModel.resourceCreate')}
            </button>
          </>
        }
      >
        <FormField label={t('dataModel.resourceName')}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            autoComplete="off"
          />
        </FormField>
        <FormField label={t('dataModel.resourceRows')} hint={t('dataModel.resourceRowsHint')}>
          <ResourceRowEditor rows={rows} onChange={setRows} />
        </FormField>
      </Dialog>
    </>
  );
}
