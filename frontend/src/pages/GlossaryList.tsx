import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Plus, Trash2, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchGlossaries,
  createGlossary,
  deleteGlossary,
  updateGlossary,
  type GlossaryResponse,
} from '../data/glossariesApi';
import './GlossaryList.css';

export function GlossaryList() {
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
      toast.error(e instanceof Error ? e.message : 'Failed to load glossaries');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      await createGlossary({ name: formName.trim(), description: formDesc.trim() || undefined });
      setShowCreate(false);
      setFormName('');
      setFormDesc('');
      toast.success('Glossary created');
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Create failed');
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
      toast.success('Glossary updated');
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (g: GlossaryResponse, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete "${g.name}"? This will remove all terms and synonyms.`)) return;
    try {
      await deleteGlossary(g.id);
      toast.success('Glossary deleted');
      load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
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
          <h1>Glossaries</h1>
          <p className="page-subtitle">
            Manage domain terms and synonyms with bilingual (EN/CN) support.
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
          <span>New Glossary</span>
        </button>
      </div>

      {loading && <p className="glossary-loading">Loading...</p>}

      {!loading && glossaries.length === 0 && (
        <div className="glossary-empty">
          <BookOpen size={48} strokeWidth={1} />
          <p>No glossaries yet. Create one to get started.</p>
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
                <button type="button" title="Edit" aria-label="Edit" onClick={(e) => openEdit(g, e)}>
                  <Pencil size={15} />
                </button>
                <button type="button" title="Delete" aria-label="Delete" onClick={(e) => handleDelete(g, e)}>
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
            <h3>{g.name}</h3>
            <p className="glossary-desc">{g.description || 'No description'}</p>
            <div className="glossary-meta">
              <span>{g.term_count} terms</span>
            </div>
          </Link>
        ))}
      </div>

      {(showCreate || editGlossary) && (
        <div className="glossary-dialog-overlay" onClick={closeDialog}>
          <div className="glossary-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="glossary-dialog-header">
              <h2>{editGlossary ? 'Edit Glossary' : 'New Glossary'}</h2>
              <button type="button" className="glossary-dialog-close" onClick={closeDialog}>
                <X size={20} />
              </button>
            </div>
            <div className="glossary-dialog-body">
              <label>
                <span>Name</span>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Glossary name"
                  autoFocus
                />
              </label>
              <label>
                <span>Description</span>
                <textarea
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Optional description (e.g. domain)"
                  rows={3}
                />
              </label>
            </div>
            <div className="glossary-dialog-footer">
              <button type="button" className="btn btn-secondary" onClick={closeDialog}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!formName.trim() || saving}
                onClick={editGlossary ? handleEdit : handleCreate}
              >
                {saving ? 'Saving...' : editGlossary ? 'Save' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
