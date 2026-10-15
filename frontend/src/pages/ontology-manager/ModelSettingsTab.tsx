import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  deleteSemanticModel,
  exportSemanticModel,
  exportSemanticModelYaml,
  updateSemanticModel,
} from '../../data/semanticModelsApi';
import { useConfirm } from '../../contexts/ConfirmContext';
import { EntityViewField, EntityViewHeader, EntityViewPanel } from './EntityViewShell';
import { ModelYamlPanel } from './ModelYamlPanel';
import { useSemanticModelDetail } from './SemanticModelDetailPage';

function download(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Model → Settings: identity + dataset scope, the Ossie interchange, and delete. */
export function ModelSettingsTab() {
  const { t } = useTranslation('ontology');
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { model, allDatasets, reload } = useSemanticModelDetail();

  const [name, setName] = useState(model.name);
  const [description, setDescription] = useState(model.description ?? '');
  const [datasetIds, setDatasetIds] = useState<string[]>(model.dataset_ids);
  const [saving, setSaving] = useState(false);
  const [showYaml, setShowYaml] = useState(false);

  const datasetLabel = (d: (typeof allDatasets)[number]) =>
    d.display_name || `${d.schema_name}.${d.table_name}`;

  const toggleDataset = (id: string) =>
    setDatasetIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error(t('dataModel.modelNameRequired'));
      return;
    }
    setSaving(true);
    try {
      await updateSemanticModel(model.id, {
        name: name.trim(),
        description: description.trim() || null,
        dataset_ids: datasetIds,
      });
      toast.success(t('dataModel.modelSaved'));
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataModel.modelSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleViewYaml = () => setShowYaml(true);

  const handleExport = async (format: 'json' | 'yaml') => {
    try {
      if (format === 'yaml') {
        download(`${model.name}.yaml`, await exportSemanticModelYaml(model.id), 'application/yaml');
      } else {
        const doc = await exportSemanticModel(model.id);
        download(`${model.name}.json`, JSON.stringify(doc, null, 2), 'application/json');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataModel.exportFailed'));
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: t('shared.delete'),
      message: t('dataModel.modelDeleteConfirm', { name: model.name }),
      confirmLabel: t('shared.delete'),
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteSemanticModel(model.id);
      toast.success(t('dataModel.modelDeleted'));
      navigate('/data-model');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataModel.modelDeleteFailed'));
    }
  };

  return (
    <>
      <EntityViewHeader
        title={t('dataModel.settings')}
        subtitle={t('dataModel.settingsHint')}
        actions={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleSave()}
            disabled={saving || !name.trim()}
          >
            {saving ? t('shared.saving') : t('shared.save')}
          </button>
        }
      />

      <EntityViewPanel>
        <div className="entity-view__form">
          <EntityViewField label={t('dataModel.modelName')}>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </EntityViewField>
          <EntityViewField label={t('dataModel.modelDescription')}>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </EntityViewField>
          <EntityViewField
            label={t('dataModel.modelDatasets')}
            hint={t('dataModel.modelDatasetsHint')}
          >
            <div className="dataset-pk-list">
              {allDatasets.map((d) => (
                <label key={d.id} className="ds-check-row">
                  <input
                    type="checkbox"
                    checked={datasetIds.includes(d.id)}
                    onChange={() => toggleDataset(d.id)}
                  />
                  <span>{datasetLabel(d)}</span>
                </label>
              ))}
            </div>
          </EntityViewField>
        </div>
      </EntityViewPanel>

      <EntityViewPanel>
        <div className="entity-view__form">
          <h3>{t('dataModel.interchange')}</h3>
          <p className="page-subtitle">{t('dataModel.interchangeHint')}</p>
          <div className="model-settings__actions">
            <button type="button" className="btn btn-secondary" onClick={() => void handleViewYaml()}>
              {t('dataModel.viewYaml')}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => void handleExport('json')}>
              {t('dataModel.exportJson')}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => void handleExport('yaml')}>
              {t('dataModel.exportYaml')}
            </button>
          </div>
        </div>
      </EntityViewPanel>

      <EntityViewPanel>
        <div className="entity-view__form">
          <h3>{t('dataModel.dangerZone')}</h3>
          <p className="page-subtitle">{t('dataModel.deleteHint')}</p>
          <button type="button" className="btn btn-secondary" onClick={() => void handleDelete()}>
            <Trash2 size={16} aria-hidden />
            {t('shared.delete')}
          </button>
        </div>
      </EntityViewPanel>

      <ModelYamlPanel
        modelId={model.id}
        modelName={model.name}
        open={showYaml}
        onClose={() => setShowYaml(false)}
      />
    </>
  );
}
