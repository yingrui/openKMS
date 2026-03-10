import { useCallback, useEffect, useState } from 'react';
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
} from '../data/modelsApi';
import {
  fetchProviders,
  createProvider,
  updateProvider,
  deleteProvider,
  type ApiProviderResponse,
} from '../data/providersApi';
import './Models.css';

type ModalMode = 'provider' | 'model' | null;

export function Models() {
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
  const [formModelName, setFormModelName] = useState('');
  const [formConfig, setFormConfig] = useState('');

  const loadProviders = useCallback(async () => {
    try {
      const res = await fetchProviders();
      setProviders(res.items);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load providers');
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
      toast.error(e instanceof Error ? e.message : 'Failed to load models');
    } finally {
      setLoading(false);
    }
  }, [activeCategory, activeProvider, search]);

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
    setFormModelName('');
    setFormConfig('');
    setModalMode('model');
  };

  const openEditModel = (m: ApiModelResponse) => {
    setEditModel(m);
    setFormProviderId(m.provider_id);
    setFormName(m.name);
    setFormCategory(m.category);
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
        toast.success('Provider updated');
      } else {
        await createProvider({
          name: provFormName,
          base_url: provFormBaseUrl,
          api_key: provFormApiKey || null,
        });
        toast.success('Provider added');
      }
      closeModal();
      await loadProviders();
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Operation failed');
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
        model_name: formModelName || null,
        config: parsedConfig ?? null,
      };
      if (editModel) {
        await updateModel(editModel.id, payload);
        toast.success('Model updated');
      } else {
        await createModel(payload);
        toast.success('Model added');
      }
      closeModal();
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteProvider = async (id: string) => {
    if (!window.confirm('Delete this provider? Models under it must be deleted first.')) return;
    try {
      await deleteProvider(id);
      toast.success('Provider deleted');
      if (activeProvider === id) setActiveProvider(null);
      await loadProviders();
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const handleDeleteModel = async (id: string) => {
    if (!window.confirm('Delete this model? This cannot be undone.')) return;
    try {
      await deleteModel(id);
      toast.success('Model deleted');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const categoryLabel = (catId: string) => categories.find((c) => c.id === catId)?.label || catId;
  const providerModelCount = (providerId: string) =>
    models.filter((m) => m.provider_id === providerId).length;

  return (
    <div className="models">
      <div className="page-header models-header">
        <div>
          <h1>Models</h1>
          <p className="page-subtitle">
            Manage service providers first, then add models under each provider.
          </p>
        </div>
      </div>
      <div className="models-main">
        <div className="models-categories">
          <div className="models-categories-header">
            <h3>Service Providers</h3>
            <button type="button" className="btn btn-secondary btn-sm" onClick={openAddProvider}>
              <Plus size={14} />
              Add
            </button>
          </div>
          <ul className="models-category-list">
            <li
              className={`models-category-item ${activeProvider === null ? 'active' : ''}`}
              onClick={() => setActiveProvider(null)}
            >
              <Server size={16} />
              <span>All</span>
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
                  <button type="button" title="Edit provider" onClick={() => openEditProvider(p)}>
                    <Pencil size={12} />
                  </button>
                  <button type="button" title="Delete provider" onClick={() => handleDeleteProvider(p.id)}>
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
                  aria-label="Search models"
                  placeholder="Search models..."
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
                  All
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
                <span>Add Model</span>
              </button>
            </div>
          </div>
          <div className="models-table-wrap">
            {loading ? (
              <div className="models-loading">
                <Loader2 size={32} className="models-loading-spinner" />
                <p>Loading models…</p>
              </div>
            ) : (
              <table className="models-table">
                <thead>
                  <tr>
                    <th>Model</th>
                    <th>Provider</th>
                    <th>Category</th>
                    <th>Base URL</th>
                    <th className="models-table-actions-col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {models.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: 'var(--color-text-muted)' }}>
                        {providers.length === 0
                          ? 'Add a provider first, then add models.'
                          : 'No models yet. Click "Add Model" to get started.'}
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
                        <td className="models-table-url">{m.base_url}</td>
                        <td className="models-table-actions-col">
                          <div className="models-table-btns">
                            <button
                              type="button"
                              title="Edit"
                              onClick={(e) => { e.stopPropagation(); openEditModel(m); }}
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              type="button"
                              title="Delete"
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
              <h2>{editProvider ? 'Edit Provider' : 'Add Service Provider'}</h2>
              <button type="button" onClick={closeModal} disabled={submitting} aria-label="Close">
                <X size={20} />
              </button>
            </div>
            <div className="models-modal-body">
              <label>
                Name *
                <input
                  type="text"
                  value={provFormName}
                  onChange={(e) => setProvFormName(e.target.value)}
                  placeholder="e.g. OpenAI, Anthropic"
                />
              </label>
              <label>
                Base URL *
                <input
                  type="text"
                  value={provFormBaseUrl}
                  onChange={(e) => setProvFormBaseUrl(e.target.value)}
                  placeholder="e.g. https://api.openai.com/v1"
                />
              </label>
              <label>
                API Key
                <input
                  type="password"
                  value={provFormApiKey}
                  onChange={(e) => setProvFormApiKey(e.target.value)}
                  placeholder={editProvider ? '(leave empty to keep current)' : '(optional)'}
                />
              </label>
            </div>
            <div className="models-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={closeModal} disabled={submitting}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleProviderSubmit}
                disabled={!provFormName.trim() || !provFormBaseUrl.trim() || submitting}
              >
                {submitting ? 'Saving…' : editProvider ? 'Update' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalMode === 'model' && (
        <div className="models-modal-overlay" onClick={closeModal}>
          <div className="models-modal" onClick={(e) => e.stopPropagation()}>
            <div className="models-modal-header">
              <h2>{editModel ? 'Edit Model' : 'Add Model'}</h2>
              <button type="button" onClick={closeModal} disabled={submitting} aria-label="Close">
                <X size={20} />
              </button>
            </div>
            <div className="models-modal-body">
              <label>
                Provider *
                <select
                  value={formProviderId}
                  onChange={(e) => setFormProviderId(e.target.value)}
                >
                  <option value="">Select provider</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Name *
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. GPT-4"
                />
              </label>
              <label>
                Category *
                <select value={formCategory} onChange={(e) => setFormCategory(e.target.value)}>
                  <option value="">Select category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </label>
              <label>
                Model Name
                <input
                  type="text"
                  value={formModelName}
                  onChange={(e) => setFormModelName(e.target.value)}
                  placeholder="e.g. gpt-4"
                />
              </label>
              <label>
                Config (JSON)
                <textarea
                  rows={3}
                  value={formConfig}
                  onChange={(e) => setFormConfig(e.target.value)}
                  placeholder='{"max_concurrency": 3}'
                />
              </label>
            </div>
            <div className="models-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={closeModal} disabled={submitting}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleModelSubmit}
                disabled={!formName.trim() || !formProviderId || !formCategory || submitting}
              >
                {submitting ? 'Saving…' : editModel ? 'Update' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
