import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  deleteDataResource,
  fetchDataResource,
  updateDataResource,
  type DataResourceResponse,
} from '../../data/dataResourcesApi';
import { DataResourceGranteesPanel } from '../../components/DataResourceGranteesPanel';
import { useConfirm } from '../../contexts/ConfirmContext';
import { EntityViewHeader, EntityViewLoading } from './EntityViewShell';
import { ResourceRowEditor } from './ResourceRowEditor';
import { describePolicy, toDrafts, toPolicy, type RowDraft } from './modelRowPolicy';
// The shared tab + form chrome. Without this import the `settings-page-*` classes below match
// no rule, which is why the tabs rendered as unstyled buttons with a stray white gap.
import '../../styles/settings-page.scss';

/**
 * One data resource: its row conditions and who may read it.
 *
 * The list page used to render every resource's full access panel inline, which made a page that
 * was 90% form. Splitting them means the list answers "what resources exist", and this page
 * answers "what exactly does *this* one allow, and to whom".
 *
 * Definition and readers are two tabs rather than two stacked panels: they are edited at
 * different times for different reasons, and giving each the full pane is what makes a condition
 * list and a grantee list readable at once.
 */
const TABS = ['definition', 'access'] as const;
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
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>('definition');

  const base = `/data-model/${modelId}/resources`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const found = await fetchDataResource(resourceId);
      setResource(found);
      setName(found.name);
      setRows(toDrafts(found.row_policy));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataModel.resourceLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [resourceId, t]);

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
          <button type="button" className="btn btn-secondary" onClick={() => void onDelete()}>
            <Trash2 size={16} aria-hidden />
            {t('shared.delete')}
          </button>
        }
      />

      {/* Tabs + panel must be one account-stack child. The shell wraps every page in
          `.account-stack` (gap: space-5); leaving the strip and form as siblings puts that gap
          between them and breaks the connected card the settings-page classes assume. */}
      <div className="settings-page">
        <div className="settings-page-tabs" role="tablist" aria-label={resource.name}>
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              className={`settings-page-tab${activeTab === tab ? ' active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {t(`dataModel.resourceTab_${tab}`)}
            </button>
          ))}
        </div>

        {activeTab === 'definition' ? (
          <div className="settings-page-form">
            <section className="settings-page-section">
              <div className="settings-page-field">
                <label htmlFor="data-resource-name">{t('dataModel.resourceName')}</label>
                <input
                  id="data-resource-name"
                  type="text"
                  className="ds-control"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="settings-page-field">
                <label>{t('dataModel.resourceRows')}</label>
                <p className="settings-page-hint">{t('dataModel.resourceRowsHint')}</p>
                <ResourceRowEditor rows={rows} onChange={setRows} />
              </div>
            </section>
            {/* Save belongs to the tab that owns the fields it writes. In the page header it
                read as "save this page" while the Grantees tab had already saved itself on
                every click — the same button meant two different things depending on the tab. */}
            <div className="settings-page-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={saving || !name.trim()}
                onClick={() => void onSave()}
              >
                {saving ? t('shared.saving') : t('shared.save')}
              </button>
            </div>
          </div>
        ) : (
          /* Grantees are a property of this resource, so the panel stays on the resource's page
             rather than being repeated per row on the list. */
          <DataResourceGranteesPanel
            resourceId={resource.id}
            resourceName={resource.name}
          />
        )}
      </div>
    </>
  );
}
