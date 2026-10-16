import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useDatasetDetail } from './useDatasetDetail';
import {
  fetchDatasetMetadata,
  updateDataset,
  type ColumnMetadata,
} from '../../data/datasetsApi';
import { ChipPicker } from '../../components/ontology/ChipPicker';
import { CheckRow, FormField } from '../../styles/design-system';
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

/** Dataset settings — the **single** edit surface for a dataset (the Overview is read-only). */
export function DatasetSettingsTab() {
  const { t } = useTranslation('ontology');
  const { dataset, setDataset, onDelete } = useDatasetDetail();
  const datasetId = dataset.id;
  // Identity/catalog fields are edited here too, so there is one Save and one entry point.
  const [displayName, setDisplayName] = useState(dataset.display_name ?? '');
  const [description, setDescription] = useState(dataset.description ?? '');
  const [domain, setDomain] = useState(dataset.domain ?? '');
  const [tags, setTags] = useState((dataset.tags ?? []).join(', '));
  const [businessDefinition, setBusinessDefinition] = useState(dataset.business_definition ?? '');
  const [sensitivity, setSensitivity] = useState(dataset.sensitivity ?? '');
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
        display_name: displayName.trim() || null,
        description: description.trim() || null,
        domain: domain.trim() || null,
        tags: splitList(tags),
        business_definition: businessDefinition.trim() || null,
        sensitivity: sensitivity.trim() || null,
        is_editable: editable,
        primary_key_columns: pk,
        unique_keys: uniqueKeys.filter((k) => k.length > 0),
        ai_context: hasAi
          ? { instructions: ai.instructions.trim(), synonyms, examples }
          : null,
      });
      setDataset(updated);
      setDisplayName(updated.display_name ?? '');
      setDescription(updated.description ?? '');
      setDomain(updated.domain ?? '');
      setTags((updated.tags ?? []).join(', '));
      setBusinessDefinition(updated.business_definition ?? '');
      setSensitivity(updated.sensitivity ?? '');
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
      <EntityViewHeader
        title={t('datasets.settings')}
        subtitle={t('datasets.settingsHint')}
        actions={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void onSave()}
            disabled={saving}
          >
            {saving ? t('shared.saving') : t('shared.save')}
          </button>
        }
      />

      <EntityViewPanel>
        <div className="entity-view__form">
          <FormField label={t('datasets.displayName')}>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={`${dataset.schema_name}.${dataset.table_name}`}
            />
          </FormField>
          <FormField label={t('datasets.descriptionLabel')}>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </FormField>
          <FormField label={t('datasets.domainLabel')}>
            <input type="text" value={domain} onChange={(e) => setDomain(e.target.value)} />
          </FormField>
          <FormField label={t('datasets.tagsLabel')}>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder={t('datasets.tagsPlaceholder')}
            />
          </FormField>
          <FormField label={t('datasets.businessDefinitionLabel')}>
            <textarea
              rows={3}
              value={businessDefinition}
              onChange={(e) => setBusinessDefinition(e.target.value)}
            />
          </FormField>
          <FormField label={t('datasets.sensitivityLabel')}>
            <select value={sensitivity} onChange={(e) => setSensitivity(e.target.value)}>
              <option value="">{t('datasets.sensitivityNone')}</option>
              <option value="public">{t('datasets.sensitivityPublic')}</option>
              <option value="internal">{t('datasets.sensitivityInternal')}</option>
              <option value="confidential">{t('datasets.sensitivityConfidential')}</option>
              <option value="restricted">{t('datasets.sensitivityRestricted')}</option>
            </select>
          </FormField>
        </div>
      </EntityViewPanel>

      <EntityViewPanel>
        <div className="entity-view__form">
          <h3>{t('datasets.rowEditingSection')}</h3>
          <CheckRow
            checked={editable}
            onChange={setEditable}
            title={t('datasets.allowEditing')}
            hint={t('datasets.allowEditingHint')}
          />
        </div>
      </EntityViewPanel>

      <EntityViewPanel>
        <div className="entity-view__form">
          <h3>{t('datasets.keysSection')}</h3>
          <p className="page-subtitle">{t('datasets.primaryKeyHint')}</p>
          {/* Type-ahead, not a checkbox per column: nineteen columns and two keys made ~57 rows. */}
          <PickedColumns
            columns={columns}
            picked={pk}
            onToggle={togglePk}
            idPrefix="dataset-pk"
            ariaLabel={t('datasets.primaryKey')}
            placeholder={t('datasets.keysPickPlaceholder')}
            title={t('datasets.keysPickerTitle')}
            emptyLabel={t('datasets.keysPickerEmpty')}
            noneLabel={t('datasets.primaryKeyNone')}
          />

          <h4>{t('datasets.uniqueKeys')}</h4>
          <p className="page-subtitle">{t('datasets.uniqueKeysHint')}</p>
          {uniqueKeys.map((key, ki) => (
            <div key={ki} className="dataset-key">
              <div className="dataset-key__head">
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
              <PickedColumns
                columns={columns}
                picked={key}
                onToggle={(column) => toggleKeyCol(ki, column)}
                idPrefix={`dataset-uk-${ki}`}
                ariaLabel={t('datasets.uniqueKeyIndex', { n: ki + 1 })}
                placeholder={t('datasets.keysPickPlaceholder')}
                title={t('datasets.keysPickerTitle')}
                emptyLabel={t('datasets.keysPickerEmpty')}
                noneLabel={t('datasets.uniqueKeyEmpty')}
              />
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

/**
 * A picked set of columns: the chips, then the type-ahead that adds to them.
 *
 * Both the primary key and every unique key are the same thing — a set of columns — so they read the
 * same way, and the space cost is proportional to what is picked, not to the table's width.
 */
function PickedColumns({
  columns,
  picked,
  onToggle,
  idPrefix,
  ariaLabel,
  placeholder,
  title,
  emptyLabel,
  noneLabel,
}: {
  columns: ColumnMetadata[];
  picked: string[];
  onToggle: (column: string) => void;
  idPrefix: string;
  ariaLabel: string;
  placeholder: string;
  title: string;
  emptyLabel: string;
  noneLabel: string;
}) {
  const { t } = useTranslation('ontology');
  return (
    <div className="dataset-key__body">
      <div className="chip-row">
        {picked.length === 0 && <span className="page-subtitle">{noneLabel}</span>}
        {picked.map((column) => (
          <span key={column} className="chip">
            {column}
            <button
              type="button"
              className="chip__remove"
              aria-label={t('datasets.keysRemoveColumn', { column })}
              onClick={() => onToggle(column)}
            >
              <X size={12} aria-hidden />
            </button>
          </span>
        ))}
      </div>
      <ChipPicker
        idPrefix={idPrefix}
        options={columns.map((c) => ({ id: c.column_name, label: c.column_name, hint: c.data_type }))}
        isPicked={(id) => picked.includes(id)}
        onPick={onToggle}
        onBackspaceEmpty={() => picked.length > 0 && onToggle(picked[picked.length - 1])}
        ariaLabel={ariaLabel}
        placeholder={placeholder}
        title={title}
        emptyLabel={emptyLabel}
      />
    </div>
  );
}
