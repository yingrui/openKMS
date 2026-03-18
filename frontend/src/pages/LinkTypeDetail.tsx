import { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import {
  fetchLinkType,
  fetchLinkInstances,
  fetchObjectInstances,
  createLinkInstance,
  deleteLinkInstance,
  type LinkTypeResponse,
  type LinkInstanceResponse,
} from '../data/ontologyApi';
import './LinkTypeDetail.css';

function objectLabel(data: Record<string, unknown> | null | undefined): string {
  if (!data) return '—';
  if (typeof data.name === 'string') return data.name;
  const first = Object.values(data).find((v) => v !== null && v !== undefined && v !== '');
  return first != null ? String(first) : '—';
}

export function LinkTypeDetail() {
  const { typeId } = useParams<{ typeId: string }>();
  const { isAdmin } = useAuth();
  const [linkType, setLinkType] = useState<LinkTypeResponse | null>(null);
  const [instances, setInstances] = useState<LinkInstanceResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [sourceOptions, setSourceOptions] = useState<{ id: string; label: string }[]>([]);
  const [targetOptions, setTargetOptions] = useState<{ id: string; label: string }[]>([]);
  const [formSourceId, setFormSourceId] = useState('');
  const [formTargetId, setFormTargetId] = useState('');
  const [saving, setSaving] = useState(false);

  const loadType = useCallback(async () => {
    if (!typeId) return;
    try {
      const data = await fetchLinkType(typeId);
      setLinkType(data);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load link type');
    } finally {
      setLoading(false);
    }
  }, [typeId]);

  const loadInstances = useCallback(async () => {
    if (!typeId) return;
    try {
      const res = await fetchLinkInstances(typeId);
      setInstances(res.items);
    } catch {
      /* noop */
    }
  }, [typeId]);

  useEffect(() => {
    loadType();
  }, [loadType]);

  useEffect(() => {
    if (typeId) loadInstances();
  }, [typeId, loadInstances]);

  useEffect(() => {
    if (!linkType) return;
    const loadOptions = async () => {
      try {
        const [srcRes, tgtRes] = await Promise.all([
          fetchObjectInstances(linkType.source_object_type_id),
          fetchObjectInstances(linkType.target_object_type_id),
        ]);
        setSourceOptions(
          srcRes.items.map((o) => ({ id: o.id, label: objectLabel(o.data) }))
        );
        setTargetOptions(
          tgtRes.items.map((o) => ({ id: o.id, label: objectLabel(o.data) }))
        );
      } catch {
        setSourceOptions([]);
        setTargetOptions([]);
      }
    };
    loadOptions();
  }, [linkType]);

  const openAdd = () => {
    setFormSourceId(sourceOptions[0]?.id ?? '');
    setFormTargetId(targetOptions[0]?.id ?? '');
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setFormSourceId('');
    setFormTargetId('');
  };

  const handleCreate = async () => {
    if (!typeId || !formSourceId || !formTargetId) {
      toast.error('Select both source and target');
      return;
    }
    if (formSourceId === formTargetId) {
      toast.error('Source and target must be different');
      return;
    }
    setSaving(true);
    try {
      await createLinkInstance(typeId, {
        source_object_id: formSourceId,
        target_object_id: formTargetId,
      });
      toast.success('Link created');
      closeForm();
      loadInstances();
      loadType();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to create link');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (inst: LinkInstanceResponse) => {
    if (!typeId) return;
    if (!confirm('Delete this link?')) return;
    try {
      await deleteLinkInstance(typeId, inst.id);
      toast.success('Link deleted');
      loadInstances();
      loadType();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  if (loading || !linkType) {
    return (
      <div className="link-type-detail">
        <p className="link-type-detail-loading">Loading...</p>
      </div>
    );
  }

  return (
    <div className="link-type-detail">
      <div className="link-type-detail-header">
        <Link to="/links" className="link-type-back">
          <ArrowLeft size={18} />
          <span>Links</span>
        </Link>
        <div className="link-type-detail-title-row">
          <h1>{linkType.name}</h1>
          {isAdmin && (
            <button type="button" className="btn btn-primary" onClick={openAdd}>
              <Plus size={18} />
              <span>Add Link</span>
            </button>
          )}
        </div>
        {linkType.description && (
          <p className="link-type-detail-desc">{linkType.description}</p>
        )}
        <p className="link-type-arrow-label">
          {linkType.source_object_type_name} → {linkType.target_object_type_name}
        </p>
      </div>

      <div className="link-type-table-wrapper">
        <table className="link-type-table">
          <thead>
            <tr>
              <th>Source</th>
              <th>Target</th>
              {isAdmin && <th className="link-type-actions-col" />}
            </tr>
          </thead>
          <tbody>
            {instances.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 3 : 2} className="link-type-empty">
                  No links yet.{isAdmin ? ' Click "Add Link" to create one.' : ''}
                </td>
              </tr>
            ) : (
              instances.map((inst) => (
                <tr key={inst.id}>
                  <td>{objectLabel(inst.source_data)}</td>
                  <td>{objectLabel(inst.target_data)}</td>
                  {isAdmin && (
                    <td className="link-type-actions-col">
                      <button
                        type="button"
                        title="Delete"
                        aria-label="Delete"
                        onClick={() => handleDelete(inst)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="link-type-dialog-overlay" onClick={closeForm}>
          <div className="link-type-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="link-type-dialog-header">
              <h2>Add Link</h2>
              <button type="button" className="link-type-dialog-close" onClick={closeForm}>
                <X size={20} />
              </button>
            </div>
            <div className="link-type-dialog-body">
              <label>
                <span>Source ({linkType.source_object_type_name})</span>
                <select
                  value={formSourceId}
                  onChange={(e) => setFormSourceId(e.target.value)}
                >
                  <option value="">Select source</option>
                  {sourceOptions.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Target ({linkType.target_object_type_name})</span>
                <select
                  value={formTargetId}
                  onChange={(e) => setFormTargetId(e.target.value)}
                >
                  <option value="">Select target</option>
                  {targetOptions.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
              </label>
              {sourceOptions.length === 0 && (
                <p className="link-type-no-objects">
                  No {linkType.source_object_type_name} instances. Create them in Objects.
                </p>
              )}
              {targetOptions.length === 0 && sourceOptions.length > 0 && (
                <p className="link-type-no-objects">
                  No {linkType.target_object_type_name} instances. Create them in Objects.
                </p>
              )}
            </div>
            <div className="link-type-dialog-footer">
              <button type="button" className="btn btn-secondary" onClick={closeForm}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!formSourceId || !formTargetId || formSourceId === formTargetId || saving}
                onClick={handleCreate}
              >
                {saving ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
