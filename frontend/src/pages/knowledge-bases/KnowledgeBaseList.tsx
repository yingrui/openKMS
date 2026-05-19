import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Database, Plus, MessageCircle, Trash2, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchKnowledgeBases,
  createKnowledgeBase,
  deleteKnowledgeBase,
  updateKnowledgeBase,
  type KnowledgeBaseResponse,
} from '../../data/knowledgeBasesApi';
import './KnowledgeBaseList.css';

export function KnowledgeBaseList() {
  const { t } = useTranslation('knowledgeBase');
  const { t: ts } = useTranslation('explore');
  const [kbs, setKbs] = useState<KnowledgeBaseResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editKb, setEditKb] = useState<KnowledgeBaseResponse | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const data = await fetchKnowledgeBases();
      setKbs(data.items);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('toastLoadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleCreate = async () => {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      await createKnowledgeBase({ name: formName.trim(), description: formDesc.trim() || undefined });
      setShowCreate(false);
      setFormName('');
      setFormDesc('');
      toast.success(t('toastCreated'));
      void load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : ts('shared.createFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!editKb || !formName.trim()) return;
    setSaving(true);
    try {
      await updateKnowledgeBase(editKb.id, { name: formName.trim(), description: formDesc.trim() || undefined });
      setEditKb(null);
      setFormName('');
      setFormDesc('');
      toast.success(t('toastUpdated'));
      void load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : ts('shared.updateFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (kb: KnowledgeBaseResponse, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(t('deleteConfirm', { name: kb.name }))) return;
    try {
      await deleteKnowledgeBase(kb.id);
      toast.success(t('toastDeleted'));
      void load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : ts('shared.deleteFailed'));
    }
  };

  const openEdit = (kb: KnowledgeBaseResponse, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditKb(kb);
    setFormName(kb.name);
    setFormDesc(kb.description || '');
  };

  const closeDialog = () => {
    setShowCreate(false);
    setEditKb(null);
    setFormName('');
    setFormDesc('');
  };

  return (
    <div className="kb-list">
      <div className="page-header kb-header">
        <div>
          <h1>{t('title')}</h1>
          <p className="page-subtitle">{t('subtitle')}</p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setShowCreate(true);
            setFormName('');
            setFormDesc('');
          }}
        >
          <Plus size={18} />
          <span>{t('newKb')}</span>
        </button>
      </div>

      {loading && <p className="kb-loading">{ts('shared.loading')}</p>}

      {!loading && kbs.length === 0 && (
        <div className="kb-empty">
          <Database size={48} strokeWidth={1} />
          <p>{t('empty')}</p>
        </div>
      )}

      <div className="kb-grid">
        {kbs.map((kb) => (
          <Link key={kb.id} to={`/knowledge-bases/${kb.id}`} className="kb-card">
            <div className="kb-card-top">
              <div className="kb-icon">
                <Database size={28} strokeWidth={1.5} />
              </div>
              <div className="kb-card-actions">
                <button type="button" title={ts('shared.edit')} aria-label={ts('shared.edit')} onClick={(e) => openEdit(kb, e)}>
                  <Pencil size={15} />
                </button>
                <button type="button" title={ts('shared.delete')} aria-label={ts('shared.delete')} onClick={(e) => void handleDelete(kb, e)}>
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
            <h3>{kb.name}</h3>
            <p className="kb-desc">{kb.description || ts('shared.noDescription')}</p>
            <div className="kb-meta">
              <span>{t('metaDocs', { count: kb.document_count })}</span>
              <span>{t('metaWikiSpaces', { count: kb.wiki_space_count ?? 0 })}</span>
              <span>{t('metaFaqs', { count: kb.faq_count })}</span>
              <span>{t('metaChunks', { count: kb.chunk_count })}</span>
              {kb.agent_url && (
                <span className="kb-rag-badge">
                  <MessageCircle size={14} />
                  {t('ragBadge')}
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>

      {(showCreate || editKb) && (
        <div className="kb-dialog-overlay" onClick={closeDialog}>
          <div className="kb-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="kb-dialog-header">
              <h2>{editKb ? t('dialogEdit') : t('dialogNew')}</h2>
              <button type="button" className="kb-dialog-close" aria-label={ts('shared.close')} onClick={closeDialog}>
                <X size={20} />
              </button>
            </div>
            <div className="kb-dialog-body">
              <label>
                <span>{ts('shared.name')}</span>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder={t('placeholderName')}
                  autoFocus
                />
              </label>
              <label>
                <span>{ts('shared.description')}</span>
                <textarea
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder={t('placeholderDesc')}
                  rows={3}
                />
              </label>
            </div>
            <div className="kb-dialog-footer">
              <button type="button" className="btn btn-secondary" onClick={closeDialog}>
                {ts('shared.cancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!formName.trim() || saving}
                onClick={() => void (editKb ? handleEdit() : handleCreate())}
              >
                {saving ? ts('shared.saving') : editKb ? ts('shared.save') : ts('shared.create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
