import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Loader2, Plus, Trash2, ChevronUp, ChevronDown, Code, Settings, Zap, FileSearch, Tag } from 'lucide-react';
import { useDocumentChannels } from '../contexts/DocumentChannelsContext';
import {
  findChannel,
  getDocumentChannelName,
  extractionSchemaToEditorFields,
  editorFieldsToJsonSchema,
  type ExtractionSchemaField,
} from '../data/channelUtils';
import { fetchPipelines, type PipelineResponse } from '../data/pipelinesApi';
import { fetchModels, type ApiModelResponse } from '../data/modelsApi';
import { fetchObjectTypes, type ObjectTypeResponse } from '../data/ontologyApi';
import { toast } from 'sonner';
import { updateChannel, type LabelConfigItem } from '../data/channelsApi';
import './DocumentChannelSettings.css';

const SCHEMA_PRESETS: Record<string, ExtractionSchemaField[]> = {
  academic: [
    { key: 'abstract', label: 'Abstract', type: 'string', description: 'One-sentence summary of the document\'s main content' },
    { key: 'author', label: 'Author', type: 'string', description: 'Primary author or first author name' },
    { key: 'authors', label: 'Authors', type: 'array', description: 'Full list of all authors in order' },
    { key: 'publish_date', label: 'Publish Date', type: 'date', description: 'Publication date in YYYY-MM-DD format' },
    { key: 'source', label: 'Source', type: 'string', description: 'Journal, conference, or publisher name' },
    { key: 'keywords', label: 'Keywords', type: 'array', description: 'Keywords or key phrases describing the content' },
    { key: 'categories', label: 'Categories', type: 'array', description: 'Subject categories or topic classifications' },
  ],
  report: [
    { key: 'title', label: 'Title', type: 'string', description: 'Document title or headline' },
    { key: 'author', label: 'Author', type: 'string', description: 'Author or preparer of the report' },
    { key: 'date', label: 'Date', type: 'date', description: 'Report date in YYYY-MM-DD format' },
    { key: 'summary', label: 'Summary', type: 'string', description: 'Executive summary or brief overview' },
    { key: 'status', label: 'Status', type: 'enum', description: 'Document status', enum: ['draft', 'in_review', 'published', 'archived'] },
    { key: 'tags', label: 'Tags', type: 'array', description: 'Tags or labels for categorization' },
  ],
  minimal: [
    { key: 'abstract', label: 'Abstract', type: 'string', description: 'Brief summary of the document' },
    { key: 'author', label: 'Author', type: 'string', description: 'Author name' },
    { key: 'tags', label: 'Tags', type: 'array', description: 'Relevant tags or keywords' },
  ],
};

export function DocumentChannelSettings() {
  const navigate = useNavigate();
  const { t } = useTranslation('documents');
  const { channelId = '' } = useParams<{ channelId: string }>();
  const { channels, refetch: refreshChannels } = useDocumentChannels();

  const [pipelines, setPipelines] = useState<PipelineResponse[]>([]);
  const [pipelinesLoading, setPipelinesLoading] = useState(true);
  const [llmModels, setLlmModels] = useState<ApiModelResponse[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [masterDataObjectTypes, setMasterDataObjectTypes] = useState<ObjectTypeResponse[]>([]);
  const [objectTypesLoading, setObjectTypesLoading] = useState(true);

  const channel = channels.length > 0 ? findChannel(channels, channelId) : null;
  const [channelNameField, setChannelNameField] = useState('');
  const [channelDescription, setChannelDescription] = useState('');
  const [pipelineId, setPipelineId] = useState('');
  const [autoProcess, setAutoProcess] = useState(false);
  const [extractionModelId, setExtractionModelId] = useState('');
  const [extractionSchema, setExtractionSchema] = useState<ExtractionSchemaField[]>([]);
  const [labelConfig, setLabelConfig] = useState<{ key: string; object_type_id: string; display_label?: string; type?: 'object_type' | 'list[object_type]' }[]>([]);
  const [objectTypeExtractionMaxInstances, setObjectTypeExtractionMaxInstances] = useState<number | ''>('');
  const [saving, setSaving] = useState(false);
  const [showJsonPreview, setShowJsonPreview] = useState(false);

  type TabId = 'general' | 'processing' | 'extraction' | 'labels';
  const [activeTab, setActiveTab] = useState<TabId>('general');

  const channelName = getDocumentChannelName(channels, channelId);

  const loadPipelines = useCallback(async () => {
    setPipelinesLoading(true);
    try {
      const res = await fetchPipelines();
      setPipelines(res.items);
    } catch {
      setPipelines([]);
    } finally {
      setPipelinesLoading(false);
    }
  }, []);

  const loadModels = useCallback(async () => {
    setModelsLoading(true);
    try {
      const res = await fetchModels({ category: 'llm' });
      setLlmModels(res.items);
    } catch {
      setLlmModels([]);
    } finally {
      setModelsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPipelines();
  }, [loadPipelines]);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  const loadMasterDataObjectTypes = useCallback(async () => {
    setObjectTypesLoading(true);
    try {
      const res = await fetchObjectTypes({ isMasterData: true });
      setMasterDataObjectTypes(res.items);
    } catch {
      setMasterDataObjectTypes([]);
    } finally {
      setObjectTypesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMasterDataObjectTypes();
  }, [loadMasterDataObjectTypes]);

  useEffect(() => {
    if (channel) {
      setChannelNameField(channel.name || '');
      setChannelDescription(channel.description ?? '');
      setPipelineId(channel.pipeline_id || '');
      setAutoProcess(channel.auto_process || false);
      setExtractionModelId(channel.extraction_model_id || '');
      setExtractionSchema(extractionSchemaToEditorFields(channel.extraction_schema ?? null));
      const lc = channel.label_config;
      setLabelConfig(
        Array.isArray(lc)
          ? lc.map((x: LabelConfigItem) => ({
              key: x.key ?? '',
              object_type_id: x.object_type_id ?? '',
              display_label: x.display_label ?? '',
              type: (x.type === 'list[object_type]' ? 'list[object_type]' : 'object_type') as 'object_type' | 'list[object_type]',
            }))
          : []
      );
      const maxInst = channel.object_type_extraction_max_instances;
      setObjectTypeExtractionMaxInstances(maxInst != null ? maxInst : '');
    }
  }, [channel]);

  useEffect(() => {
    if (!channelId) navigate('/documents/channels');
  }, [channelId, navigate]);

  if (!channelId) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      /* Use array format to preserve field order; JSON object key order is not guaranteed across parse/serialize. */
      const schemaToSave = extractionSchema
        .filter((f) => f.key?.trim())
        .map((f) => ({
          key: f.key.trim(),
          label: f.label || f.key,
          type: f.type || 'string',
          description: f.description ?? '',
          required: !!f.required,
          ...(f.type === 'enum' && Array.isArray(f.enum) && f.enum.length > 0 && { enum: f.enum }),
          ...((f.type === 'object_type' || f.type === 'list[object_type]') && f.object_type_id && { object_type_id: f.object_type_id }),
        }));
      const labelConfigToSave = labelConfig
        .filter((l) => l.key.trim() && l.object_type_id)
        .map((l) => ({
          key: l.key.trim(),
          object_type_id: l.object_type_id,
          display_label: l.display_label?.trim() || null,
          type: l.type === 'list[object_type]' ? 'list[object_type]' as const : 'object_type' as const,
        }));
      await updateChannel(channelId, {
        name: channelNameField.trim() || channel?.name,
        description: channelDescription.trim() || null,
        pipeline_id: pipelineId || null,
        auto_process: autoProcess,
        extraction_model_id: extractionModelId || null,
        extraction_schema: schemaToSave.length > 0 ? schemaToSave : null,
        label_config: labelConfigToSave.length > 0 ? labelConfigToSave : null,
        object_type_extraction_max_instances: objectTypeExtractionMaxInstances === '' ? null : Number(objectTypeExtractionMaxInstances),
      });
      if (refreshChannels) await refreshChannels();
      toast.success(t('settings.savedToast'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('settings.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const addSchemaField = () => {
    setExtractionSchema((prev) => [...prev, { key: '', label: '', type: 'string', description: '', required: false }]);
  };

  const jsonSchemaPreview = editorFieldsToJsonSchema(extractionSchema);

  const updateSchemaField = (index: number, field: Partial<ExtractionSchemaField>) => {
    setExtractionSchema((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...field };
      return next;
    });
  };

  const removeSchemaField = (index: number) => {
    setExtractionSchema((prev) => prev.filter((_, i) => i !== index));
  };

  const moveSchemaField = (index: number, dir: 'up' | 'down') => {
    setExtractionSchema((prev) => {
      const next = [...prev];
      const j = dir === 'up' ? index - 1 : index + 1;
      if (j < 0 || j >= next.length) return prev;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  };

  const applyPreset = (presetKey: string) => {
    const preset = SCHEMA_PRESETS[presetKey];
    if (preset) setExtractionSchema([...preset]);
  };

  const addLabelConfig = () => {
    setLabelConfig((prev) => [...prev, { key: '', object_type_id: '', display_label: '', type: 'object_type' as const }]);
  };

  const updateLabelConfig = (index: number, field: Partial<typeof labelConfig[0]>) => {
    setLabelConfig((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...field };
      return next;
    });
  };

  const removeLabelConfig = (index: number) => {
    setLabelConfig((prev) => prev.filter((_, i) => i !== index));
  };

  const tabs: { id: TabId; label: string; icon: typeof Settings }[] = useMemo(
    () => [
      { id: 'general', label: t('settings.tabGeneral'), icon: Settings },
      { id: 'processing', label: t('settings.tabProcessing'), icon: Zap },
      { id: 'extraction', label: t('settings.tabExtraction'), icon: FileSearch },
      { id: 'labels', label: t('settings.tabLabels'), icon: Tag },
    ],
    [t],
  );

  return (
    <div className="document-channel-settings">
      <Link to={`/documents/channels/${channelId}`} className="document-channel-settings-back">
        <ArrowLeft size={18} />
        <span>{t('common.backToDocuments')}</span>
      </Link>

      <div className="page-header">
        <h1>{t('settings.pageTitle')}</h1>
        <p className="page-subtitle">
          {t('settings.pageSubtitle', { name: channelName })}
        </p>
      </div>

      <div className="document-channel-settings-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`document-channel-settings-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <tab.icon size={16} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="document-channel-settings-form">
        {activeTab === 'general' && (
        <section className="document-channel-settings-section">
          <h2>{t('settings.generalHeading')}</h2>
          <div className="document-channel-settings-field">
            <label htmlFor="channel-name">{t('common.name')}</label>
            <input
              id="channel-name"
              type="text"
              value={channelNameField}
              onChange={(e) => setChannelNameField(e.target.value)}
              placeholder={t('settings.namePlaceholder')}
            />
          </div>
          <div className="document-channel-settings-field">
            <label htmlFor="channel-description">{t('common.description')}</label>
            <textarea
              id="channel-description"
              value={channelDescription}
              onChange={(e) => setChannelDescription(e.target.value)}
              placeholder={t('settings.descPlaceholder')}
              rows={2}
            />
          </div>
        </section>
        )}

        {activeTab === 'processing' && (
        <section className="document-channel-settings-section">
          <h2>{t('settings.pipelineHeading')}</h2>
          <div className="document-channel-settings-field">
            <label htmlFor="pipeline">{t('settings.pipelineLabel')}</label>
            {pipelinesLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Loader2 size={16} className="dcs-spinner" />
                <span>{t('settings.loadingPipelines')}</span>
              </div>
            ) : (
              <select
                id="pipeline"
                value={pipelineId}
                onChange={(e) => setPipelineId(e.target.value)}
              >
                <option value="">{t('common.none')}</option>
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <h2>{t('settings.autoProcessHeading')}</h2>
          <div className="document-channel-settings-field">
            <label>
              <input
                type="checkbox"
                checked={autoProcess}
                onChange={(e) => setAutoProcess(e.target.checked)}
              />
              <span>{t('settings.autoProcessLabel')}</span>
            </label>
            <p className="document-channel-settings-hint">
              {t('settings.autoProcessHint')}
            </p>
          </div>
        </section>
        )}

        {activeTab === 'extraction' && (
        <section className="document-channel-settings-section">
          <h2>{t('settings.extractionHeading')}</h2>
          <p className="document-channel-settings-hint">
            {t('settings.extractionIntro')}
          </p>
          <div className="document-channel-settings-field">
            <label htmlFor="extraction-model">{t('settings.extractionModel')}</label>
            {modelsLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Loader2 size={16} className="dcs-spinner" />
                <span>{t('settings.loadingModels')}</span>
              </div>
            ) : (
              <select
                id="extraction-model"
                value={extractionModelId}
                onChange={(e) => setExtractionModelId(e.target.value)}
              >
                <option value="">{t('common.none')}</option>
                {llmModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="document-channel-settings-field">
            <label>{t('settings.schemaLabel')}</label>
            <p className="document-channel-settings-hint">
              {t('settings.schemaHint')}
            </p>
            <div className="dcs-schema-presets">
              {Object.keys(SCHEMA_PRESETS).map((k) => (
                <button
                  key={k}
                  type="button"
                  className="btn btn-secondary dcs-preset-btn"
                  onClick={() => applyPreset(k)}
                >
                  {k === 'academic' ? t('settings.presetAcademic') : k === 'report' ? t('settings.presetReport') : t('settings.presetMinimal')}
                </button>
              ))}
            </div>
            <div className="dcs-schema-list">
              {extractionSchema.map((field, i) => (
                <div key={i} className="dcs-schema-item">
                  <div className="dcs-schema-row">
                    <div className="dcs-schema-move">
                      <button
                        type="button"
                        className="dcs-schema-move-btn"
                        onClick={() => moveSchemaField(i, 'up')}
                        disabled={i === 0}
                        aria-label={t('settings.ariaMoveSchemaUp')}
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        type="button"
                        className="dcs-schema-move-btn"
                        onClick={() => moveSchemaField(i, 'down')}
                        disabled={i === extractionSchema.length - 1}
                        aria-label={t('settings.ariaMoveSchemaDown')}
                      >
                        <ChevronDown size={14} />
                      </button>
                    </div>
                    <input
                      type="text"
                      placeholder={t('settings.placeholderKey')}
                      value={field.key}
                      onChange={(e) => updateSchemaField(i, { key: e.target.value })}
                      className="dcs-schema-input dcs-schema-key"
                    />
                    <input
                      type="text"
                      placeholder={t('settings.placeholderLabel')}
                      value={field.label}
                      onChange={(e) => updateSchemaField(i, { label: e.target.value })}
                      className="dcs-schema-input dcs-schema-label"
                    />
                    <select
                      value={field.type}
                      onChange={(e) => updateSchemaField(i, { type: e.target.value })}
                      className="dcs-schema-select"
                    >
                      <option value="string">string</option>
                      <option value="date">date</option>
                      <option value="array">array</option>
                      <option value="enum">enum</option>
                      <option value="object_type">object_type</option>
                      <option value="list[object_type]">list[object_type]</option>
                      <option value="integer">integer</option>
                      <option value="number">number</option>
                      <option value="boolean">boolean</option>
                    </select>
                    <label className="dcs-schema-required">
                      <input
                        type="checkbox"
                        checked={!!field.required}
                        onChange={(e) => updateSchemaField(i, { required: e.target.checked })}
                      />
                      <span>{t('settings.required')}</span>
                    </label>
                    <button
                      type="button"
                      className="dcs-schema-remove"
                      onClick={() => removeSchemaField(i)}
                      aria-label={t('settings.ariaRemoveField')}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder={t('settings.descriptionPlaceholder')}
                    value={field.description ?? ''}
                    onChange={(e) => updateSchemaField(i, { description: e.target.value })}
                    className="dcs-schema-input dcs-schema-description"
                  />
                  {field.type === 'enum' && (
                    <input
                      type="text"
                      placeholder={t('settings.enumPlaceholder')}
                      value={(field.enum ?? []).join(', ')}
                      onChange={(e) =>
                        updateSchemaField(i, {
                          enum: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                        })
                      }
                      className="dcs-schema-input dcs-schema-enum"
                    />
                  )}
                  {(field.type === 'object_type' || field.type === 'list[object_type]') && (
                    <select
                      value={field.object_type_id ?? ''}
                      onChange={(e) => updateSchemaField(i, { object_type_id: e.target.value || undefined })}
                      className="dcs-schema-select dcs-schema-object-type"
                      style={{ marginTop: 4 }}
                    >
                      <option value="">{t('settings.selectObjectType')}</option>
                      {masterDataObjectTypes.map((ot) => (
                        <option key={ot.id} value={ot.id}>
                          {ot.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
            </div>
            <button type="button" className="btn btn-secondary dcs-add-field" onClick={addSchemaField}>
              <Plus size={14} />
              <span>{t('settings.addField')}</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary dcs-view-json-btn"
              onClick={() => setShowJsonPreview((v) => !v)}
              title={showJsonPreview ? t('settings.hideJson') : t('settings.jsonPreviewTitle')}
            >
              <Code size={14} />
              <span>{showJsonPreview ? t('settings.hideJson') : t('settings.viewJson')}</span>
            </button>
            {showJsonPreview && (
              <pre className="dcs-json-preview">
                {jsonSchemaPreview
                  ? JSON.stringify(jsonSchemaPreview, null, 2)
                  : '{\n  "type": "object",\n  "properties": {},\n  "required": []\n}'}
              </pre>
            )}
            <div className="document-channel-settings-field" style={{ marginTop: 16 }}>
              <label htmlFor="extraction-max-instances">{t('settings.maxInstancesLabel')}</label>
              <input
                id="extraction-max-instances"
                type="number"
                min={1}
                placeholder={t('settings.maxInstancesPlaceholder')}
                value={objectTypeExtractionMaxInstances}
                onChange={(e) => setObjectTypeExtractionMaxInstances(e.target.value === '' ? '' : Number(e.target.value))}
                className="dcs-schema-input"
                style={{ width: 120 }}
              />
              <p className="document-channel-settings-hint">
                {t('settings.maxInstancesHint')}
              </p>
            </div>
            {extractionModelId && extractionSchema.length === 0 && (
              <p className="document-channel-settings-hint dcs-schema-empty-hint">
                {t('settings.schemaEmptyHint')}
              </p>
            )}
          </div>
        </section>
        )}

        {activeTab === 'labels' && (
        <section className="document-channel-settings-section">
          <h2>{t('settings.labelsHeading')}</h2>
          <p className="document-channel-settings-hint">
            {t('settings.labelsIntro')}
          </p>
          <div className="document-channel-settings-field">
            <label>{t('settings.labelConfigs')}</label>
            <div className="dcs-schema-list">
              {labelConfig.map((item, i) => (
                <div key={i} className="dcs-schema-item">
                  <div className="dcs-schema-row">
                    <input
                      type="text"
                      placeholder={t('settings.labelKeyPlaceholder')}
                      value={item.key}
                      onChange={(e) => updateLabelConfig(i, { key: e.target.value })}
                      className="dcs-schema-input dcs-schema-key"
                    />
                    <select
                      value={item.object_type_id}
                      onChange={(e) => updateLabelConfig(i, { object_type_id: e.target.value })}
                      className="dcs-schema-select"
                    >
                      <option value="">{t('settings.selectObjectType')}</option>
                      {masterDataObjectTypes.map((ot) => (
                        <option key={ot.id} value={ot.id}>
                          {ot.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder={t('settings.displayLabelPlaceholder')}
                      value={item.display_label ?? ''}
                      onChange={(e) => updateLabelConfig(i, { display_label: e.target.value })}
                      className="dcs-schema-input"
                      style={{ minWidth: 120 }}
                    />
                    <select
                      value={item.type === 'list[object_type]' ? 'list[object_type]' : 'object_type'}
                      onChange={(e) => updateLabelConfig(i, { type: e.target.value as 'object_type' | 'list[object_type]' })}
                      className="dcs-schema-select"
                      style={{ minWidth: 140 }}
                    >
                      <option value="object_type">object_type</option>
                      <option value="list[object_type]">list[object_type]</option>
                    </select>
                    <button
                      type="button"
                      className="dcs-schema-remove"
                      onClick={() => removeLabelConfig(i)}
                      aria-label={t('settings.ariaRemoveLabel')}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {objectTypesLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <Loader2 size={16} className="dcs-spinner" />
                <span>{t('settings.loadingObjectTypes')}</span>
              </div>
            ) : masterDataObjectTypes.length === 0 ? (
              <p className="document-channel-settings-hint">
                {t('settings.noMasterDataTypes')}
              </p>
            ) : null}
            <button type="button" className="btn btn-secondary dcs-add-field" onClick={addLabelConfig} style={{ marginTop: 8 }}>
              <Plus size={14} />
              <span>{t('settings.addManualLabel')}</span>
            </button>
          </div>
        </section>
        )}

        <div className="document-channel-settings-actions">
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? t('settings.saving') : t('settings.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

