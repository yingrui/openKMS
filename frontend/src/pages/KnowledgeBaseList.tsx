import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Database, Plus, MessageCircle, Trash2, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchKnowledgeBases,
  createKnowledgeBase,
  deleteKnowledgeBase,
  updateKnowledgeBase,
  type KnowledgeBaseResponse,
} from '../data/knowledgeBasesApi';
import './KnowledgeBaseList.css';

export function KnowledgeBaseList() {
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
      toast.error(e instanceof Error ? e.message : 'Failed to load knowledge bases');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      await createKnowledgeBase({ name: formName.trim(), description: formDesc.trim() || undefined });
      setShowCreate(false);
      setFormName('');
      setFormDesc('');
      toast.success('Knowledge base created');
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Create failed');
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
      toast.success('Knowledge base updated');
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (kb: KnowledgeBaseResponse, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete "${kb.name}"? This will remove all associated documents, FAQs, and chunks.`)) return;
    try {
      await deleteKnowledgeBase(kb.id);
      toast.success('Knowledge base deleted');
      load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
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
          <h1>Knowledge Bases</h1>
          <p className="page-subtitle">
            Create knowledge bases, add documents, generate FAQs, and enable RAG Q&A per KB.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => { setShowCreate(true); setFormName(''); setFormDesc(''); }}>
          <Plus size={18} />
          <span>New Knowledge Base</span>
        </button>
      </div>

      {loading && <p className="kb-loading">Loading...</p>}

      {!loading && kbs.length === 0 && (
        <div className="kb-empty">
          <Database size={48} strokeWidth={1} />
          <p>No knowledge bases yet. Create one to get started.</p>
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
                <button type="button" title="Edit" aria-label="Edit" onClick={(e) => openEdit(kb, e)}>
                  <Pencil size={15} />
                </button>
                <button type="button" title="Delete" aria-label="Delete" onClick={(e) => handleDelete(kb, e)}>
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
            <h3>{kb.name}</h3>
            <p className="kb-desc">{kb.description || 'No description'}</p>
            <div className="kb-meta">
              <span>{kb.document_count} docs</span>
              <span>{kb.faq_count} FAQs</span>
              <span>{kb.chunk_count} chunks</span>
              {kb.agent_url && (
                <span className="kb-rag-badge">
                  <MessageCircle size={14} />
                  RAG Q&A
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
              <h2>{editKb ? 'Edit Knowledge Base' : 'New Knowledge Base'}</h2>
              <button type="button" className="kb-dialog-close" onClick={closeDialog}>
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
                  placeholder="Knowledge base name"
                  autoFocus
                />
              </label>
              <label>
                <span>Description</span>
                <textarea
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Optional description"
                  rows={3}
                />
              </label>
            </div>
            <div className="kb-dialog-footer">
              <button type="button" className="btn btn-secondary" onClick={closeDialog}>Cancel</button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!formName.trim() || saving}
                onClick={editKb ? handleEdit : handleCreate}
              >
                {saving ? 'Saving...' : editKb ? 'Save' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
