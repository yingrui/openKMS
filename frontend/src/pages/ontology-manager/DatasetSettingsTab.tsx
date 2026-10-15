import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useDatasetDetail } from './DatasetDetailPage';
import {
  fetchDatasetMetadata,
  updateDataset,
  type ColumnMetadata,
} from '../../data/datasetsApi';
import { FormField } from '../../styles/design-system';
import { EntityViewHeader, EntityViewPanel, EntityViewLoading } from './EntityViewShell';

type AiContext = { instructions: string; synonyms: string; examples: string };

function readAiContext(raw: unknown): AiContext {
  const o = (raw ?? {}) as { instructions?: string; synonyms?: string[]; examples?: string[] };
  return {
    instructions: o.instructions ?? '',
    synonyms: (o.synonyms ?? []).join(', '),
    examples: (o.examples ?? []).join(', '),
  };
}

const splitList = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

/** Dataset settings: row editing, keys (PK + unique) and agent AI context. */
export function DatasetSettingsTab() {
  const { t } = useTranslation('ontology');
  const { dataset, setDataset, onDelete } = useDatasetDetail();
  const datasetId = dataset.id;
  const [columns, setColumns] = useState<ColumnMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [editable, setEditable] = useState(dataset.is_editable);
  const [pk, setPk] = useState<string[]>(dataset.primary_key_columns ?? []);
  const [uniqueKeys, setUniqueKeys] = useState<string[][]>(dataset.unique_keys ?? []);
  const [ai, setAi] = useState<AiContext>(() => readAiContext(dataset.ai_context));
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

  const toggleKeyCol = (ki: number, col: string) =>
    setUniqueKeys((prev) =>
      prev.map((key, i) =>
        i === ki ? (key.includes(col) ? key.filter((c) => c !== col) : [...key, col]) : key,
      ),
    );

  const onSave = async () => {
    setSaving(true);
    try {
      const synonyms = splitList(ai.synonyms);
      const examples = splitList(ai.examples);
      const hasAi = ai.instructions.trim() || synonyms.length || examples.length;
      const updated = await updateDataset(datasetId, {
        is_editable: editable,
        primary_key_columns: pk,
        unique_keys: uniqueKeys.filter((k) => k.length > 0),
        ai_context: hasAi
          ? { instructions: ai.instructions.trim(), synonyms, examples }
          : null,
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
        </div>
      </EntityViewPanel>

      <EntityViewPanel>
        <div className="entity-view__form">
          <h3>{t('datasets.keysSection')}</h3>
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

          <h4>{t('datasets.uniqueKeys')}</h4>
          <p className="page-subtitle">{t('datasets.uniqueKeysHint')}</p>
          {uniqueKeys.map((key, ki) => (
            <div key={ki} className="dataset-pk-list">
              <div className="dataset-pk-list__row-head">
                <strong>
                  {t('datasets.uniqueKeyIndex', { n: ki + 1 })}
                  {key.length > 0 ? `: ${key.join(', ')}` : ''}
                </strong>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setUniqueKeys((prev) => prev.filter((_, i) => i !== ki))}
                  title={t('shared.delete')}
                >
                  <Trash2 size={16} aria-hidden />
                </button>
              </div>
              {columns.map((c) => (
                <label key={c.column_name} className="ds-check-row">
                  <input
                    type="checkbox"
                    checked={key.includes(c.column_name)}
                    onChange={() => toggleKeyCol(ki, c.column_name)}
                  />
                  <span>{c.column_name}</span>
                </label>
              ))}
            </div>
          ))}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setUniqueKeys((prev) => [...prev, []])}
          >
            <Plus size={16} aria-hidden />
            {t('datasets.addUniqueKey')}
          </button>
        </div>
      </EntityViewPanel>

      <EntityViewPanel>
        <div className="entity-view__form">
          <h3>{t('datasets.aiContext')}</h3>
          <p className="page-subtitle">{t('datasets.aiContextHint')}</p>
          <FormField label={t('datasets.aiInstructions')}>
            <textarea
              rows={3}
              value={ai.instructions}
              onChange={(e) => setAi((prev) => ({ ...prev, instructions: e.target.value }))}
            />
          </FormField>
          <FormField label={t('datasets.aiSynonyms')}>
            <input
              type="text"
              value={ai.synonyms}
              onChange={(e) => setAi((prev) => ({ ...prev, synonyms: e.target.value }))}
            />
          </FormField>
          <FormField label={t('datasets.aiExamples')}>
            <input
              type="text"
              value={ai.examples}
              onChange={(e) => setAi((prev) => ({ ...prev, examples: e.target.value }))}
            />
          </FormField>
        </div>
      </EntityViewPanel>

      <EntityViewPanel>
        <div className="entity-view__form">
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

      <div className="ontology-danger-zone">
        <h2>{t('datasets.dangerZone')}</h2>
        <p className="page-subtitle">{t('datasets.deleteHint')}</p>
        <button type="button" className="btn btn-danger" onClick={() => void onDelete()}>
          <Trash2 size={16} aria-hidden />
          {t('shared.delete')}
        </button>
      </div>
    </>
  );
}
