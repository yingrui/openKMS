import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchLinkTypes,
  fetchObjectTypes,
  createLinkType,
  updateLinkType,
  deleteLinkType,
  type LinkTypeResponse,
  type ObjectTypeResponse,
} from '../../data/ontologyApi';
import './ConsoleObjectTypes.css';

export function ConsoleLinkTypes() {
  const [linkTypes, setLinkTypes] = useState<LinkTypeResponse[]>([]);
  const [objectTypes, setObjectTypes] = useState<ObjectTypeResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editType, setEditType] = useState<LinkTypeResponse | null>(null);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formSourceId, setFormSourceId] = useState('');
  const [formTargetId, setFormTargetId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [linksRes, objsRes] = await Promise.all([
        fetchLinkTypes(),
        fetchObjectTypes(),
      ]);
      setLinkTypes(linksRes.items);
      setObjectTypes(objsRes.items);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load link types');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditType(null);
    setFormName('');
    setFormDescription('');
    setFormSourceId(objectTypes[0]?.id || '');
    setFormTargetId(objectTypes[0]?.id || '');
    setShowForm(true);
  };

  const openEdit = (t: LinkTypeResponse) => {
    setEditType(t);
    setFormName(t.name);
    setFormDescription(t.description || '');
    setFormSourceId(t.source_object_type_id);
    setFormTargetId(t.target_object_type_id);
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!formName.trim() || !formSourceId || !formTargetId) return;
    setSubmitting(true);
    try {
      if (editType) {
        await updateLinkType(editType.id, {
          name: formName.trim(),
          description: formDescription.trim() || undefined,
          source_object_type_id: formSourceId,
          target_object_type_id: formTargetId,
        });
        toast.success('Link type updated');
      } else {
        await createLinkType({
          name: formName.trim(),
          description: formDescription.trim() || undefined,
          source_object_type_id: formSourceId,
          target_object_type_id: formTargetId,
        });
        toast.success('Link type created');
      }
      setShowForm(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this link type? All link instances will be deleted.')) return;
    try {
      await deleteLinkType(id);
      toast.success('Link type deleted');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  return (
    <div className="console-object-types">
      <div className="page-header">
        <div>
          <h1>Link Types</h1>
          <p className="page-subtitle">
            Define relationships between object types (e.g. Disease → InsuranceProduct). Admin only.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={openCreate}
          disabled={objectTypes.length < 2}
          title={objectTypes.length < 2 ? 'Create at least 2 object types first' : ''}
        >
          <Plus size={18} />
          <span>New Link Type</span>
        </button>
      </div>

      <div className="console-object-types-content">
        <div className="console-object-types-table-wrap">
          {loading ? (
            <div className="console-loading">
              <Loader2 size={32} className="console-loading-spinner" />
              <p>Loading…</p>
            </div>
          ) : (
            <table className="console-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Source → Target</th>
                <th>Links</th>
                <th className="console-table-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {linkTypes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="console-table-empty">
                    No link types yet. Create at least 2 object types, then create a link type.
                  </td>
                </tr>
              ) : (
                linkTypes.map((t) => (
                  <tr key={t.id}>
                    <td><strong>{t.name}</strong></td>
                    <td>{t.description || '—'}</td>
                    <td>
                      {t.source_object_type_name || t.source_object_type_id} →{' '}
                      {t.target_object_type_name || t.target_object_type_id}
                    </td>
                    <td>{t.link_count}</td>
                    <td className="console-table-actions">
                      <div className="console-table-btns">
                        <button type="button" title="Edit" onClick={() => openEdit(t)}>
                          <Pencil size={16} />
                        </button>
                        <button type="button" title="Delete" onClick={() => handleDelete(t.id)}>
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

      {showForm && (
        <div className="console-modal-overlay" onClick={() => !submitting && setShowForm(false)}>
          <div className="console-modal" onClick={(e) => e.stopPropagation()}>
            <div className="console-modal-header">
              <h2>{editType ? 'Edit Link Type' : 'New Link Type'}</h2>
              <button
                type="button"
                onClick={() => !submitting && setShowForm(false)}
                disabled={submitting}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            <div className="console-modal-body">
              <label>
                Name
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. covers"
                />
              </label>
              <label>
                Description
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Optional"
                />
              </label>
              <label>
                Source object type
                <select
                  value={formSourceId}
                  onChange={(e) => setFormSourceId(e.target.value)}
                >
                  <option value="">Select…</option>
                  {objectTypes.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Target object type
                <select
                  value={formTargetId}
                  onChange={(e) => setFormTargetId(e.target.value)}
                >
                  <option value="">Select…</option>
                  {objectTypes.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="console-modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => !submitting && setShowForm(false)}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSubmit}
                disabled={
                  !formName.trim() || !formSourceId || !formTargetId || submitting
                }
              >
                {submitting ? 'Saving…' : editType ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
