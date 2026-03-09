import { useCallback, useEffect, useState } from 'react';
import { Plus, Cpu, Search, Trash2, Pencil, X, Loader2 } from 'lucide-react';
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
import './Models.css';

export function Models() {
  const [models, setModels] = useState<ApiModelResponse[]>([]);
  const [categories, setCategories] = useState<ModelCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editModel, setEditModel] = useState<ApiModelResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [formName, setFormName] = useState('');
  const [formProvider, setFormProvider] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formBaseUrl, setFormBaseUrl] = useState('');
  const [formApiKey, setFormApiKey] = useState('');
  const [formModelName, setFormModelName] = useState('');
  const [formConfig, setFormConfig] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, cats] = await Promise.all([
        fetchModels({ category: activeCategory || undefined, search: search || undefined }),
        fetchModelCategories(),
      ]);
      setModels(res.items);
      setCategories(cats);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load models');
    } finally {
      setLoading(false);
    }
  }, [activeCategory, search]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditModel(null);
    setFormName('');
    setFormProvider('');
    setFormCategory(activeCategory || (categories[0]?.id ?? ''));
    setFormBaseUrl('');
    setFormApiKey('');
    setFormModelName('');
    setFormConfig('');
    setShowModal(true);
  };

  const openEdit = (m: ApiModelResponse) => {
    setEditModel(m);
    setFormName(m.name);
    setFormProvider(m.provider);
    setFormCategory(m.category);
    setFormBaseUrl(m.base_url);
    setFormApiKey('');
    setFormModelName(m.model_name || '');
    setFormConfig(m.config ? JSON.stringify(m.config, null, 2) : '');
    setShowModal(true);
  };

  const closeModal = () => {
    if (!submitting) {
      setShowModal(false);
      setEditModel(null);
    }
  };

  const handleSubmit = async () => {
    if (!formName.trim() || !formProvider.trim() || !formCategory || !formBaseUrl.trim()) return;
    setSubmitting(true);
    try {
      let parsedConfig: Record<string, unknown> | undefined;
      if (formConfig.trim()) {
        parsedConfig = JSON.parse(formConfig);
      }

      const payload = {
        name: formName,
        provider: formProvider,
        category: formCategory,
        base_url: formBaseUrl,
        api_key: formApiKey || null,
        model_name: formModelName || null,
        config: parsedConfig ?? null,
      };

      if (editModel) {
        await updateModel(editModel.id, payload);
      } else {
        await createModel(payload);
      }
      setShowModal(false);
      setEditModel(null);
      toast.success(editModel ? 'Model updated' : 'Model registered');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this model? This cannot be undone.')) return;
    try {
      await deleteModel(id);
      toast.success('Model deleted');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const categoryLabel = (catId: string) =>
    categories.find((c) => c.id === catId)?.label || catId;

  return (
    <div className="models">
      <div className="page-header models-header">
        <div>
          <h1>Models</h1>
          <p className="page-subtitle">
            Manage external API providers and inference APIs: OCR, VL, LLM, Embedding, Text Classification, and more.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          <Plus size={18} />
          <span>Add API</span>
        </button>
      </div>
      <div className="models-main">
        <div className="models-categories">
          <h3>API categories</h3>
          <ul className="models-category-list">
            <li
              className={`models-category-item ${activeCategory === null ? 'active' : ''}`}
              onClick={() => setActiveCategory(null)}
            >
              <Cpu size={16} />
              <span>All</span>
            </li>
            {categories.map((cat) => (
              <li
                key={cat.id}
                className={`models-category-item ${activeCategory === cat.id ? 'active' : ''}`}
                onClick={() => setActiveCategory(cat.id)}
              >
                <Cpu size={16} />
                <span>{cat.label}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="models-content">
          <div className="models-toolbar">
            <div className="models-search">
              <Search size={18} />
              <input
                type="search"
                placeholder="Search models..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
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
                    <th>API Key</th>
                    <th className="models-table-actions-col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {models.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: 'var(--color-text-muted)' }}>
                        No models registered yet. Click "Add API" to get started.
                      </td>
                    </tr>
                  ) : (
                    models.map((m) => (
                      <tr key={m.id}>
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
                        <td>{m.provider}</td>
                        <td>{categoryLabel(m.category)}</td>
                        <td className="models-table-url">{m.base_url}</td>
                        <td className="models-table-muted">{m.api_key_set ? '••••••••' : '—'}</td>
                        <td className="models-table-actions-col">
                          <div className="models-table-btns">
                            <button type="button" title="Edit" onClick={() => openEdit(m)}>
                              <Pencil size={16} />
                            </button>
                            <button type="button" title="Delete" onClick={() => handleDelete(m.id)}>
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

      {showModal && (
        <div className="models-modal-overlay" onClick={closeModal}>
          <div className="models-modal" onClick={(e) => e.stopPropagation()}>
            <div className="models-modal-header">
              <h2>{editModel ? 'Edit Model' : 'Register New API'}</h2>
              <button type="button" onClick={closeModal} disabled={submitting} aria-label="Close">
                <X size={20} />
              </button>
            </div>
            <div className="models-modal-body">
              <label>
                Name *
                <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. PaddleOCR-VL-1.5" />
              </label>
              <label>
                Provider *
                <input type="text" value={formProvider} onChange={(e) => setFormProvider(e.target.value)} placeholder="e.g. PaddlePaddle" />
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
                Base URL *
                <input type="text" value={formBaseUrl} onChange={(e) => setFormBaseUrl(e.target.value)} placeholder="e.g. http://localhost:8101/" />
              </label>
              <label>
                API Key
                <input type="password" value={formApiKey} onChange={(e) => setFormApiKey(e.target.value)} placeholder={editModel ? '(leave empty to keep current)' : '(optional)'} />
              </label>
              <label>
                Model Name
                <input type="text" value={formModelName} onChange={(e) => setFormModelName(e.target.value)} placeholder="e.g. PaddlePaddle/PaddleOCR-VL-1.5" />
              </label>
              <label>
                Config (JSON)
                <textarea rows={3} value={formConfig} onChange={(e) => setFormConfig(e.target.value)} placeholder='{"max_concurrency": 3}' />
              </label>
            </div>
            <div className="models-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={closeModal} disabled={submitting}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSubmit}
                disabled={!formName.trim() || !formProvider.trim() || !formCategory || !formBaseUrl.trim() || submitting}
              >
                {submitting ? 'Saving…' : editModel ? 'Update' : 'Register'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
