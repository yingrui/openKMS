import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Plus, Trash2, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchEvaluationDatasets,
  createEvaluationDataset,
  deleteEvaluationDataset,
  updateEvaluationDataset,
  type EvaluationDatasetResponse,
} from '../data/evaluationDatasetsApi';
import { fetchKnowledgeBases, type KnowledgeBaseResponse } from '../data/knowledgeBasesApi';
import './EvaluationDatasetList.css';

export function EvaluationDatasetList() {
  const [datasets, setDatasets] = useState<EvaluationDatasetResponse[]>([]);
  const [kbs, setKbs] = useState<KnowledgeBaseResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editDs, setEditDs] = useState<EvaluationDatasetResponse | null>(null);
  const [formName, setFormName] = useState('');
  const [formKbId, setFormKbId] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const [dsData, kbData] = await Promise.all([
        fetchEvaluationDatasets(),
        fetchKnowledgeBases(),
      ]);
      setDatasets(dsData.items);
      setKbs(kbData.items);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load evaluation datasets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!formName.trim() || !formKbId) return;
    setSaving(true);
    try {
      await createEvaluationDataset({
        name: formName.trim(),
        knowledge_base_id: formKbId,
        description: formDesc.trim() || undefined,
      });
      setShowCreate(false);
      setFormName('');
      setFormKbId('');
      setFormDesc('');
      toast.success('Evaluation dataset created');
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!editDs || !formName.trim()) return;
    setSaving(true);
    try {
      await updateEvaluationDataset(editDs.id, {
        name: formName.trim(),
        description: formDesc.trim() || undefined,
      });
      setEditDs(null);
      setFormName('');
      setFormDesc('');
      toast.success('Evaluation dataset updated');
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (ds: EvaluationDatasetResponse, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete "${ds.name}"? This will remove all evaluation items.`)) return;
    try {
      await deleteEvaluationDataset(ds.id);
      toast.success('Evaluation dataset deleted');
      load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const openEdit = (ds: EvaluationDatasetResponse, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditDs(ds);
    setFormName(ds.name);
    setFormDesc(ds.description || '');
  };

  const closeDialog = () => {
    setShowCreate(false);
    setEditDs(null);
    setFormName('');
    setFormKbId('');
    setFormDesc('');
  };

  return (
    <div className="eval-list">
      <div className="page-header eval-header">
        <div>
          <h1>Evaluation</h1>
          <p className="page-subtitle">
            Manage query + expected answer pairs to evaluate KB QA performance. Experimental feature.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setShowCreate(true);
            setFormName('');
            setFormKbId(kbs[0]?.id ?? '');
            setFormDesc('');
          }}
        >
          <Plus size={18} />
          <span>New Dataset</span>
        </button>
      </div>

      {loading && <p className="eval-loading">Loading...</p>}

      {!loading && datasets.length === 0 && (
        <div className="eval-empty">
          <ClipboardList size={48} strokeWidth={1} />
          <p>No evaluation datasets yet. Create one to get started.</p>
        </div>
      )}

      <div className="eval-grid">
        {datasets.map((ds) => (
          <Link key={ds.id} to={`/evaluation-datasets/${ds.id}`} className="eval-card">
            <div className="eval-card-top">
              <div className="eval-icon">
                <ClipboardList size={28} strokeWidth={1.5} />
              </div>
              <div className="eval-card-actions">
                <button type="button" title="Edit" aria-label="Edit" onClick={(e) => openEdit(ds, e)}>
                  <Pencil size={15} />
                </button>
                <button type="button" title="Delete" aria-label="Delete" onClick={(e) => handleDelete(ds, e)}>
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
            <h3>{ds.name}</h3>
            <p className="eval-desc">{ds.description || 'No description'}</p>
            <div className="eval-meta">
              <span>{ds.knowledge_base_name || ds.knowledge_base_id}</span>
              <span>{ds.item_count} items</span>
            </div>
          </Link>
        ))}
      </div>

      {(showCreate || editDs) && (
        <div className="eval-dialog-overlay" onClick={closeDialog}>
          <div className="eval-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="eval-dialog-header">
              <h2>{editDs ? 'Edit Evaluation Dataset' : 'New Evaluation Dataset'}</h2>
              <button type="button" className="eval-dialog-close" onClick={closeDialog}>
                <X size={20} />
              </button>
            </div>
            <div className="eval-dialog-body">
              <label>
                <span>Name</span>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Dataset name"
                  autoFocus
                />
              </label>
              {showCreate && (
                <label>
                  <span>Knowledge Base</span>
                  <select
                    value={formKbId}
                    onChange={(e) => setFormKbId(e.target.value)}
                    required
                  >
                    <option value="">Select KB...</option>
                    {kbs.map((kb) => (
                      <option key={kb.id} value={kb.id}>{kb.name}</option>
                    ))}
                  </select>
                </label>
              )}
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
            <div className="eval-dialog-footer">
              <button type="button" className="btn btn-secondary" onClick={closeDialog}>Cancel</button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!formName.trim() || (showCreate && !formKbId) || saving}
                onClick={editDs ? handleEdit : handleCreate}
              >
                {saving ? 'Saving...' : editDs ? 'Save' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
