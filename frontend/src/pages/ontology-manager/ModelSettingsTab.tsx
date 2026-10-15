import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  deleteSemanticModel,
  exportSemanticModel,
  exportSemanticModelYaml,
  updateSemanticModel,
} from '../../data/semanticModelsApi';
import { useConfirm } from '../../contexts/ConfirmContext';
import { FormField } from '../../styles/design-system';
import { EntityViewHeader, EntityViewPanel } from './EntityViewShell';
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

  const [pick, setPick] = useState('');
  const selectedDatasets = allDatasets.filter((d) => datasetIds.includes(d.id));
  const availableDatasets = allDatasets.filter((d) => !datasetIds.includes(d.id));

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
          <FormField label={t('dataModel.modelName')}>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField label={t('dataModel.modelDescription')}>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </FormField>
          <FormField
            label={t('dataModel.modelDatasets')}
            hint={t('dataModel.modelDatasetsHint')}
          >
            {selectedDatasets.length === 0 ? (
              <p className="page-subtitle">{t('dataModel.noDatasetsSelected')}</p>
            ) : (
              <ul className="model-scope-edit">
                {selectedDatasets.map((d) => (
                  <li key={d.id}>
                    <span>{datasetLabel(d)}</span>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      aria-label={t('dataModel.removeDataset', { name: datasetLabel(d) })}
                      onClick={() => setDatasetIds((prev) => prev.filter((x) => x !== d.id))}
                    >
                      <X size={14} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {availableDatasets.length > 0 && (
              <div className="model-scope-add">
                <select value={pick} onChange={(e) => setPick(e.target.value)}>
                  <option value="">{t('dataModel.addDataset')}</option>
                  {availableDatasets.map((d) => (
                    <option key={d.id} value={d.id}>
                      {datasetLabel(d)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={!pick}
                  onClick={() => {
                    setDatasetIds((prev) => [...prev, pick]);
                    setPick('');
                  }}
                >
                  <Plus size={16} aria-hidden />
                  {t('dataModel.addDataset')}
                </button>
              </div>
            )}
          </FormField>
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

      <div className="ontology-danger-zone">
        <h2>{t('dataModel.dangerZone')}</h2>
        <p className="page-subtitle">{t('dataModel.deleteHint')}</p>
        <button type="button" className="btn btn-danger" onClick={() => void handleDelete()}>
          <Trash2 size={16} aria-hidden />
          {t('shared.delete')}
        </button>
      </div>

      <ModelYamlPanel
        modelId={model.id}
        modelName={model.name}
        open={showYaml}
        onClose={() => setShowYaml(false)}
      />
    </>
  );
}
