import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useDatasetDetail } from './DatasetDetailPage';
import {
  fetchDatasetMetadata,
  updateDataset,
  type ColumnMetadata,
} from '../../data/datasetsApi';
import { EntityViewHeader, EntityViewPanel, EntityViewLoading } from './EntityViewShell';

/** Dataset settings: opt-in row editing + the primary key used to target rows. */
export function DatasetSettingsTab() {
  const { t } = useTranslation('ontology');
  const { dataset, setDataset } = useDatasetDetail();
  const datasetId = dataset.id;
  const [columns, setColumns] = useState<ColumnMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [editable, setEditable] = useState(dataset.is_editable);
  const [pk, setPk] = useState<string[]>(dataset.primary_key_columns ?? []);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchDatasetMetadata(datasetId)
      .then((m) => {
        if (!cancelled) setColumns(m);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [datasetId]);

  const togglePk = (col: string) =>
    setPk((prev) => (prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]));

  const onSave = async () => {
    setSaving(true);
    try {
      const updated = await updateDataset(datasetId, {
        is_editable: editable,
        primary_key_columns: pk,
      });
      setDataset(updated);
      toast.success(t('datasets.saved'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <EntityViewLoading label={t('shared.loading')} />;

  return (
    <>
      <EntityViewHeader title={t('datasets.settings')} subtitle={t('datasets.settingsHint')} />
      <EntityViewPanel>
        <div className="entity-view__form">
          <label className="ds-check-row">
            <input
              type="checkbox"
              checked={editable}
              onChange={(e) => setEditable(e.target.checked)}
            />
            <span>{t('datasets.allowEditing')}</span>
          </label>
          <p className="page-subtitle">{t('datasets.allowEditingHint')}</p>

          {editable && (
            <>
              <p className="page-subtitle">{t('datasets.primaryKeyHint')}</p>
              <div className="dataset-pk-list">
                {columns.map((c) => (
                  <label key={c.column_name} className="ds-check-row">
                    <input
                      type="checkbox"
                      checked={pk.includes(c.column_name)}
                      onChange={() => togglePk(c.column_name)}
                    />
                    <span>
                      {c.column_name} <em>{c.data_type}</em>
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void onSave()}
            disabled={saving}
          >
            {saving ? t('shared.saving') : t('shared.save')}
          </button>
        </div>
      </EntityViewPanel>
    </>
  );
}
