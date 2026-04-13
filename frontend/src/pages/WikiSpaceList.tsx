import { useEffect, useState } from 'react';
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
      toast.error(e instanceof Error ? e.message : 'Failed to load wiki spaces');
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
      toast.success('Wiki space created');
      void load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Create failed');
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
      toast.success('Wiki space updated');
      void load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (sp: WikiSpaceResponse, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete "${sp.name}"? All pages and file metadata in this space will be removed.`)) return;
    try {
      await deleteWikiSpace(sp.id);
      toast.success('Wiki space deleted');
      void load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
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
          <h1>Wiki spaces</h1>
          <p className="page-subtitle">
            Organize markdown wiki pages; sync content from openkms-cli or edit in the browser.
          </p>
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
          <span>New wiki space</span>
        </button>
      </div>

      {loading && <p className="kb-loading">Loading...</p>}

      {!loading && spaces.length === 0 && (
        <div className="kb-empty">
          <BookOpen size={48} strokeWidth={1} />
          <p>No wiki spaces yet. Create one to get started.</p>
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
                  <button type="button" title="Edit" aria-label="Edit" onClick={(e) => openEdit(sp, e)}>
                    <Pencil size={15} />
                  </button>
                  <button type="button" title="Delete" aria-label="Delete" onClick={(e) => void handleDelete(sp, e)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              <h3>{sp.name}</h3>
              <p className="kb-desc">{sp.description || 'No description'}</p>
              <div className="kb-meta">
                <span>
                  {sp.page_count} page{sp.page_count === 1 ? '' : 's'}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {(showCreate || editSp) && (
        <div className="kb-dialog-overlay" role="presentation" onClick={closeDialog}>
          <div className="kb-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="kb-dialog-header">
              <h2>{editSp ? 'Edit wiki space' : 'New wiki space'}</h2>
              <button type="button" className="kb-dialog-close" aria-label="Close" onClick={closeDialog}>
                <X size={20} />
              </button>
            </div>
            <div className="kb-dialog-body">
              <label>
                <span>Name</span>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Product wiki"
                  autoFocus
                />
              </label>
              <label>
                <span>Description</span>
                <textarea
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Optional"
                  rows={3}
                />
              </label>
            </div>
            <div className="kb-dialog-footer">
              <button type="button" className="btn btn-secondary" onClick={closeDialog}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={saving || !formName.trim()}
                onClick={() => void (editSp ? handleEdit() : handleCreate())}
              >
                {saving ? 'Saving…' : editSp ? 'Save' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
