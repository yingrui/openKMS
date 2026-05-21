import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { BookOpen, Plus, Trash2, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchGlossaries,
  createGlossary,
  deleteGlossary,
  updateGlossary,
  type GlossaryResponse,
} from '../../data/glossariesApi';
import './GlossaryList.scss';

export function GlossaryList() {
  const { t } = useTranslation('explore');
  const [glossaries, setGlossaries] = useState<GlossaryResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editGlossary, setEditGlossary] = useState<GlossaryResponse | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const data = await fetchGlossaries();
      setGlossaries(data.items);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('glossary.toastLoadFailed'));
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
      await createGlossary({ name: formName.trim(), description: formDesc.trim() || undefined });
      setShowCreate(false);
      setFormName('');
      setFormDesc('');
      toast.success(t('glossary.toastCreated'));
      void load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('shared.createFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!editGlossary || !formName.trim()) return;
    setSaving(true);
    try {
      await updateGlossary(editGlossary.id, {
        name: formName.trim(),
        description: formDesc.trim() || undefined,
      });
      setEditGlossary(null);
      setFormName('');
      setFormDesc('');
      toast.success(t('glossary.toastUpdated'));
      void load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('shared.updateFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (g: GlossaryResponse, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(t('glossary.deleteConfirm', { name: g.name }))) return;
    try {
      await deleteGlossary(g.id);
      toast.success(t('glossary.toastDeleted'));
      void load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('shared.deleteFailed'));
    }
  };

  const openEdit = (g: GlossaryResponse, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditGlossary(g);
    setFormName(g.name);
    setFormDesc(g.description || '');
  };

  const closeDialog = () => {
    setShowCreate(false);
    setEditGlossary(null);
    setFormName('');
    setFormDesc('');
  };

  return (
    <div className="glossary-list">
      <div className="page-header glossary-header">
        <div>
          <h1>{t('glossary.title')}</h1>
          <p className="page-subtitle">{t('glossary.subtitle')}</p>
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
          <span>{t('glossary.newGlossary')}</span>
        </button>
      </div>

      {loading && <p className="glossary-loading">{t('shared.loading')}</p>}

      {!loading && glossaries.length === 0 && (
        <div className="glossary-empty">
          <BookOpen size={48} strokeWidth={1} />
          <p>{t('glossary.empty')}</p>
        </div>
      )}

      <div className="glossary-grid">
        {glossaries.map((g) => (
          <Link key={g.id} to={`/glossaries/${g.id}`} className="glossary-card">
            <div className="glossary-card-top">
              <div className="glossary-icon">
                <BookOpen size={28} strokeWidth={1.5} />
              </div>
              <div className="glossary-card-actions">
                <button type="button" title={t('shared.edit')} aria-label={t('shared.edit')} onClick={(e) => openEdit(g, e)}>
                  <Pencil size={15} />
                </button>
                <button type="button" title={t('shared.delete')} aria-label={t('shared.delete')} onClick={(e) => void handleDelete(g, e)}>
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
            <h3>{g.name}</h3>
            <p className="glossary-desc">{g.description || t('shared.noDescription')}</p>
            <div className="glossary-meta">
              <span>{t('glossary.termCount', { count: g.term_count })}</span>
            </div>
          </Link>
        ))}
      </div>

      {(showCreate || editGlossary) && (
        <div className="glossary-dialog-overlay" onClick={closeDialog}>
          <div className="glossary-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="glossary-dialog-header">
              <h2>{editGlossary ? t('glossary.dialogEdit') : t('glossary.dialogNew')}</h2>
              <button type="button" className="glossary-dialog-close" aria-label={t('shared.close')} onClick={closeDialog}>
                <X size={20} />
              </button>
            </div>
            <div className="glossary-dialog-body">
              <label>
                <span>{t('shared.name')}</span>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder={t('glossary.placeholderName')}
                  autoFocus
                />
              </label>
              <label>
                <span>{t('shared.description')}</span>
                <textarea
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder={t('glossary.placeholderDesc')}
                  rows={3}
                />
              </label>
            </div>
            <div className="glossary-dialog-footer">
              <button type="button" className="btn btn-secondary" onClick={closeDialog}>
                {t('shared.cancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!formName.trim() || saving}
                onClick={() => void (editGlossary ? handleEdit() : handleCreate())}
              >
                {saving ? t('shared.saving') : editGlossary ? t('shared.save') : t('shared.create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
