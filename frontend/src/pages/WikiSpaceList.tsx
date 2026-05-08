import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { BookOpen, Plus, Trash2, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchWikiSpaces,
  createWikiSpace,
  deleteWikiSpace,
  updateWikiSpace,
  type WikiSpaceResponse,
} from '../data/wikiSpacesApi';
import './KnowledgeBaseList.css';

export function WikiSpaceList() {
  const { t } = useTranslation('explore');
  const [spaces, setSpaces] = useState<WikiSpaceResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editSp, setEditSp] = useState<WikiSpaceResponse | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const data = await fetchWikiSpaces();
      setSpaces(data.items);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('wiki.toastLoadFailed'));
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
      await createWikiSpace({ name: formName.trim(), description: formDesc.trim() || undefined });
      setShowCreate(false);
      setFormName('');
      setFormDesc('');
      toast.success(t('wiki.toastCreated'));
      void load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('shared.createFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!editSp || !formName.trim()) return;
    setSaving(true);
    try {
      await updateWikiSpace(editSp.id, { name: formName.trim(), description: formDesc.trim() || undefined });
      setEditSp(null);
      setFormName('');
      setFormDesc('');
      toast.success(t('wiki.toastUpdated'));
      void load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('shared.updateFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (sp: WikiSpaceResponse, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(t('wiki.deleteConfirm', { name: sp.name }))) return;
    try {
      await deleteWikiSpace(sp.id);
      toast.success(t('wiki.toastDeleted'));
      void load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('shared.deleteFailed'));
    }
  };

  const openEdit = (sp: WikiSpaceResponse, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditSp(sp);
    setFormName(sp.name);
    setFormDesc(sp.description || '');
  };

  const closeDialog = () => {
    setShowCreate(false);
    setEditSp(null);
    setFormName('');
    setFormDesc('');
  };

  return (
    <div className="kb-list">
      <div className="page-header kb-header">
        <div>
          <h1>{t('wiki.title')}</h1>
          <p className="page-subtitle">{t('wiki.subtitle')}</p>
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
          <span>{t('wiki.newSpace')}</span>
        </button>
      </div>

      {loading && <p className="kb-loading">{t('shared.loading')}</p>}

      {!loading && spaces.length === 0 && (
        <div className="kb-empty">
          <BookOpen size={48} strokeWidth={1} />
          <p>{t('wiki.empty')}</p>
        </div>
      )}

      {!loading && spaces.length > 0 && (
        <div className="kb-grid">
          {spaces.map((sp) => (
            <Link key={sp.id} to={`/wikis/${sp.id}`} className="kb-card">
              <div className="kb-card-top">
                <div className="kb-icon">
                  <BookOpen size={28} strokeWidth={1.5} />
                </div>
                <div className="kb-card-actions">
                  <button
                    type="button"
                    title={t('shared.edit')}
                    aria-label={t('shared.edit')}
                    onClick={(e) => openEdit(sp, e)}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    title={t('shared.delete')}
                    aria-label={t('shared.delete')}
                    onClick={(e) => void handleDelete(sp, e)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              <h3>{sp.name}</h3>
              <p className="kb-desc">{sp.description || t('shared.noDescription')}</p>
              <div className="kb-meta">
                <span>{t('wiki.pageCount', { count: sp.page_count })}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {(showCreate || editSp) && (
        <div className="kb-dialog-overlay" role="presentation" onClick={closeDialog}>
          <div className="kb-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="kb-dialog-header">
              <h2>{editSp ? t('wiki.dialogEdit') : t('wiki.dialogNew')}</h2>
              <button type="button" className="kb-dialog-close" aria-label={t('shared.close')} onClick={closeDialog}>
                <X size={20} />
              </button>
            </div>
            <div className="kb-dialog-body">
              <label>
                <span>{t('shared.name')}</span>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder={t('wiki.placeholderName')}
                  autoFocus
                />
              </label>
              <label>
                <span>{t('shared.description')}</span>
                <textarea
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder={t('shared.optional')}
                  rows={3}
                />
              </label>
            </div>
            <div className="kb-dialog-footer">
              <button type="button" className="btn btn-secondary" onClick={closeDialog}>
                {t('shared.cancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={saving || !formName.trim()}
                onClick={() => void (editSp ? handleEdit() : handleCreate())}
              >
                {saving ? t('shared.saving') : editSp ? t('shared.save') : t('shared.create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
