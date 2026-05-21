import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Plus, Cpu, Search, Trash2, Pencil, X, Loader2, Server } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchModels,
  fetchModelCategories,
  createModel,
  updateModel,
  deleteModel,
  type ApiModelResponse,
  type ModelCategory,
} from '../../data/modelsApi';
import {
  fetchProviders,
  createProvider,
  updateProvider,
  deleteProvider,
  type ApiProviderResponse,
} from '../../data/providersApi';
import './Models.scss';

type ModalMode = 'provider' | 'model' | null;

export function Models() {
  const { t } = useTranslation('workspace');
  const navigate = useNavigate();
  const [providers, setProviders] = useState<ApiProviderResponse[]>([]);
  const [models, setModels] = useState<ApiModelResponse[]>([]);
  const [categories, setCategories] = useState<ModelCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [editProvider, setEditProvider] = useState<ApiProviderResponse | null>(null);
  const [editModel, setEditModel] = useState<ApiModelResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Provider form
  const [provFormName, setProvFormName] = useState('');
  const [provFormBaseUrl, setProvFormBaseUrl] = useState('');
  const [provFormApiKey, setProvFormApiKey] = useState('');

  // Model form
  const [formProviderId, setFormProviderId] = useState('');
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formIsDefaultInCategory, setFormIsDefaultInCategory] = useState(false);
  const [formModelName, setFormModelName] = useState('');
  const [formConfig, setFormConfig] = useState('');

  const loadProviders = useCallback(async () => {
    try {
      const res = await fetchProviders();
      setProviders(res.items);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('models.loadProvidersFailed'));
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [modelsRes, cats, provsRes] = await Promise.all([
        fetchModels({
          category: activeCategory || undefined,
          provider_id: activeProvider || undefined,
          search: search || undefined,
        }),
        fetchModelCategories(),
        fetchProviders(),
      ]);
      setModels(modelsRes.items);
      setCategories(cats);
      setProviders(provsRes.items);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('models.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [activeCategory, activeProvider, search, t]);

  useEffect(() => {
    load();
  }, [load]);

  const openAddProvider = () => {
    setEditProvider(null);
    setProvFormName('');
    setProvFormBaseUrl('');
    setProvFormApiKey('');
    setModalMode('provider');
  };

  const openEditProvider = (p: ApiProviderResponse) => {
    setEditProvider(p);
    setProvFormName(p.name);
    setProvFormBaseUrl(p.base_url);
    setProvFormApiKey('');
    setModalMode('provider');
  };

  const openAddModel = () => {
    setEditModel(null);
    setFormProviderId(activeProvider || (providers[0]?.id ?? ''));
    setFormName('');
    setFormCategory(categories[0]?.id ?? '');
    setFormIsDefaultInCategory(false);
    setFormModelName('');
    setFormConfig('');
    setModalMode('model');
  };

  const openEditModel = (m: ApiModelResponse) => {
    setEditModel(m);
    setFormProviderId(m.provider_id);
    setFormName(m.name);
    setFormCategory(m.category);
    setFormIsDefaultInCategory(m.is_default_in_category ?? false);
    setFormModelName(m.model_name || '');
    setFormConfig(m.config ? JSON.stringify(m.config, null, 2) : '');
    setModalMode('model');
  };

  const closeModal = () => {
    if (!submitting) {
      setModalMode(null);
      setEditProvider(null);
      setEditModel(null);
    }
  };

  const handleProviderSubmit = async () => {
    if (!provFormName.trim() || !provFormBaseUrl.trim()) return;
    setSubmitting(true);
    try {
      if (editProvider) {
        await updateProvider(editProvider.id, {
          name: provFormName,
          base_url: provFormBaseUrl,
          api_key: provFormApiKey || undefined,
        });
        toast.success(t('models.providerUpdated'));
      } else {
        await createProvider({
          name: provFormName,
          base_url: provFormBaseUrl,
          api_key: provFormApiKey || null,
        });
        toast.success(t('models.providerAdded'));
      }
      closeModal();
      await loadProviders();
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('shared.operationFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleModelSubmit = async () => {
    if (!formName.trim() || !formProviderId || !formCategory) return;
    setSubmitting(true);
    try {
      let parsedConfig: Record<string, unknown> | undefined;
      if (formConfig.trim()) {
        parsedConfig = JSON.parse(formConfig);
      }
      const payload = {
        provider_id: formProviderId,
        name: formName,
        category: formCategory,
        is_default_in_category: formIsDefaultInCategory,
        model_name: formModelName || null,
        config: parsedConfig ?? null,
      };
      if (editModel) {
        await updateModel(editModel.id, payload);
        toast.success(t('models.modelUpdated'));
      } else {
        await createModel(payload);
        toast.success(t('models.modelAdded'));
      }
      closeModal();
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('shared.operationFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteProvider = async (id: string) => {
    if (!window.confirm(t('models.providerDeleteConfirm'))) return;
    try {
      await deleteProvider(id);
      toast.success(t('models.providerDeleted'));
      if (activeProvider === id) setActiveProvider(null);
      await loadProviders();
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('shared.deleteFailed'));
    }
  };

  const handleDeleteModel = async (id: string) => {
    if (!window.confirm(t('models.modelDeleteConfirm'))) return;
    try {
      await deleteModel(id);
      toast.success(t('models.modelDeleted'));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('shared.deleteFailed'));
    }
  };

  const handleSetDefault = async (m: ApiModelResponse, e: React.MouseEvent) => {
    e.stopPropagation();
    if (m.is_default_in_category) return;
    try {
      await updateModel(m.id, { is_default_in_category: true });
      toast.success(t('models.defaultSet', { name: m.name, category: categoryLabel(m.category) }));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('models.defaultFailed'));
    }
  };

  const categoryLabel = (catId: string) => categories.find((c) => c.id === catId)?.label || catId;
  const providerModelCount = (providerId: string) =>
    models.filter((m) => m.provider_id === providerId).length;

  return (
    <div className="models">
      <div className="page-header models-header">
        <div>
          <h1>{t('models.title')}</h1>
          <p className="page-subtitle">
            {t('models.subtitle')}
          </p>
        </div>
      </div>
      <div className="models-main">
        <div className="models-categories">
          <div className="models-categories-header">
            <h3>{t('models.serviceProviders')}</h3>
            <button type="button" className="btn btn-secondary btn-sm" onClick={openAddProvider}>
              <Plus size={14} />
              {t('shared.add')}
            </button>
          </div>
          <ul className="models-category-list">
            <li
              className={`models-category-item ${activeProvider === null ? 'active' : ''}`}
              onClick={() => setActiveProvider(null)}
            >
              <Server size={16} />
              <span>{t('shared.all')}</span>
            </li>
            {providers.map((p) => (
              <li
                key={p.id}
                className={`models-category-item models-provider-item ${activeProvider === p.id ? 'active' : ''}`}
                onClick={() => setActiveProvider(p.id)}
              >
                <Server size={16} />
                <span className="models-provider-name">{p.name}</span>
                <span className="models-provider-count">({providerModelCount(p.id)})</span>
                <div className="models-provider-actions" onClick={(e) => e.stopPropagation()}>
                  <button type="button" title={t('models.editProvider')} onClick={() => openEditProvider(p)}>
                    <Pencil size={12} />
                  </button>
                  <button type="button" title={t('models.deleteProvider')} onClick={() => handleDeleteProvider(p.id)}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="models-content">
          <div className="models-toolbar">
            <div className="models-toolbar-row">
              <div className="models-search">
                <Search size={18} />
                <input
                  type="search"
                  aria-label={t('models.searchAria')}
                  placeholder={t('models.searchPlaceholder')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="models-category-filters">
                <button
                  type="button"
                  className={`models-filter-btn ${activeCategory === null ? 'active' : ''}`}
                  onClick={() => setActiveCategory(null)}
                >
                  {t('shared.all')}
                </button>
                {categories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`models-filter-btn ${activeCategory === c.id ? 'active' : ''}`}
                    onClick={() => setActiveCategory(c.id)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <button type="button" className="btn btn-primary models-toolbar-add" onClick={openAddModel} disabled={providers.length === 0}>
                <Plus size={18} />
                <span>{t('models.addModel')}</span>
              </button>
            </div>
          </div>
          <div className="models-table-wrap">
            {loading ? (
              <div className="models-loading">
                <Loader2 size={32} className="models-loading-spinner" />
                <p>{t('models.loading')}</p>
              </div>
            ) : (
              <table className="models-table">
                <thead>
                  <tr>
                    <th>{t('models.colModel')}</th>
                    <th>{t('models.colProvider')}</th>
                    <th>{t('models.colCategory')}</th>
                    <th>{t('models.colDefault')}</th>
                    <th>{t('models.colBaseUrl')}</th>
                    <th className="models-table-actions-col">{t('shared.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {models.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="table-empty">
                        {providers.length === 0
                          ? t('models.emptyNoProviders')
                          : t('models.emptyNoModels')}
                      </td>
                    </tr>
                  ) : (
                    models.map((m) => (
                      <tr
                        key={m.id}
                        className="models-table-row-clickable"
                        onClick={() => navigate(`/models/${m.id}`)}
                      >
                        <td>
                          <div className="models-table-name">
                            <Cpu size={18} strokeWidth={1.5} />
                            <div>
                              <span>{m.name}</span>
                              {m.model_name && (
                                <span className="models-table-model-name">{m.model_name}</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>{m.provider_name}</td>
                        <td>{categoryLabel(m.category)}</td>
                        <td>
                          {m.is_default_in_category ? (
                            <span className="models-default-badge">{t('models.defaultBadge')}</span>
                          ) : (
                            <button
                              type="button"
                              className="models-set-default-btn"
                              title={t('models.setDefaultTitle', { category: categoryLabel(m.category) })}
                              onClick={(e) => handleSetDefault(m, e)}
                            >
                              {t('models.set')}
                            </button>
                          )}
                        </td>
                        <td className="models-table-url">{m.base_url}</td>
                        <td className="models-table-actions-col">
                          <div className="models-table-btns">
                            <button
                              type="button"
                              title={t('shared.edit')}
                              onClick={(e) => { e.stopPropagation(); openEditModel(m); }}
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              type="button"
                              title={t('shared.delete')}
                              onClick={(e) => { e.stopPropagation(); handleDeleteModel(m.id); }}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {modalMode === 'provider' && (
        <div className="models-modal-overlay" onClick={closeModal}>
          <div className="models-modal" onClick={(e) => e.stopPropagation()}>
            <div className="models-modal-header">
              <h2>{editProvider ? t('models.modalProviderEdit') : t('models.modalProviderAdd')}</h2>
              <button type="button" onClick={closeModal} disabled={submitting} aria-label={t('shared.close')}>
                <X size={20} />
              </button>
            </div>
            <div className="models-modal-body">
              <label>
                {t('models.provName')}
                <input
                  type="text"
                  value={provFormName}
                  onChange={(e) => setProvFormName(e.target.value)}
                  placeholder={t('models.provNamePlaceholder')}
                />
              </label>
              <label>
                {t('models.provBaseUrl')}
                <input
                  type="text"
                  value={provFormBaseUrl}
                  onChange={(e) => setProvFormBaseUrl(e.target.value)}
                  placeholder={t('models.provBasePlaceholder')}
                />
              </label>
              <label>
                {t('models.provApiKey')}
                <input
                  type="password"
                  value={provFormApiKey}
                  onChange={(e) => setProvFormApiKey(e.target.value)}
                  placeholder={editProvider ? t('models.provApiKeyPlaceholderEdit') : t('models.provApiKeyPlaceholderNew')}
                />
              </label>
            </div>
            <div className="models-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={closeModal} disabled={submitting}>
                {t('shared.cancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleProviderSubmit}
                disabled={!provFormName.trim() || !provFormBaseUrl.trim() || submitting}
              >
                {submitting ? t('shared.saving') : editProvider ? t('shared.update') : t('shared.add')}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalMode === 'model' && (
        <div className="models-modal-overlay" onClick={closeModal}>
          <div className="models-modal" onClick={(e) => e.stopPropagation()}>
            <div className="models-modal-header">
              <h2>{editModel ? t('models.modalModelEdit') : t('models.modalModelAdd')}</h2>
              <button type="button" onClick={closeModal} disabled={submitting} aria-label={t('shared.close')}>
                <X size={20} />
              </button>
            </div>
            <div className="models-modal-body">
              <label>
                {t('models.modelProvider')}
                <select
                  value={formProviderId}
                  onChange={(e) => setFormProviderId(e.target.value)}
                >
                  <option value="">{t('models.selectProvider')}</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </label>
              <label>
                {t('models.modelName')}
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder={t('models.modelNamePlaceholder')}
                />
              </label>
              <label>
                {t('models.category')}
                <select value={formCategory} onChange={(e) => setFormCategory(e.target.value)}>
                  <option value="">{t('models.selectCategory')}</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </label>
              <label className="models-checkbox-label">
                <input
                  type="checkbox"
                  checked={formIsDefaultInCategory}
                  onChange={(e) => setFormIsDefaultInCategory(e.target.checked)}
                />
                <span>{t('models.defaultInCategory')}</span>
              </label>
              <label>
                {t('models.modelApiName')}
                <input
                  type="text"
                  value={formModelName}
                  onChange={(e) => setFormModelName(e.target.value)}
                  placeholder={t('models.modelApiPlaceholder')}
                />
              </label>
              <label>
                {t('models.configJson')}
                <textarea
                  rows={3}
                  value={formConfig}
                  onChange={(e) => setFormConfig(e.target.value)}
                  placeholder={t('models.configPlaceholder')}
                />
              </label>
            </div>
            <div className="models-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={closeModal} disabled={submitting}>
                {t('shared.cancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleModelSubmit}
                disabled={!formName.trim() || !formProviderId || !formCategory || submitting}
              >
                {submitting ? t('shared.saving') : editModel ? t('shared.update') : t('shared.add')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
