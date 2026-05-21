import { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import {
  fetchLinkType,
  fetchLinkInstances,
  fetchObjectInstances,
  createLinkInstance,
  deleteLinkInstance,
  type LinkTypeResponse,
  type LinkInstanceResponse,
} from '../../data/ontologyApi';
import './LinkTypeDetail.scss';

function objectLabel(
  data: Record<string, unknown> | null | undefined,
  keyValue: string | null | undefined,
  dash: string
): string {
  if (keyValue != null && keyValue !== '') return keyValue;
  if (!data) return dash;
  if (typeof data.name === 'string') return data.name;
  const first = Object.values(data).find((v) => v !== null && v !== undefined && v !== '');
  return first != null ? String(first) : dash;
}

export function LinkTypeDetail() {
  const { t } = useTranslation('explore');
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
      const data = await fetchLinkType(typeId, { countFromNeo4j: true });
      setLinkType(data);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('ontology.linkTypeDetail.toastLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [typeId, t]);

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
          srcRes.items.map((o) => ({ id: o.id, label: objectLabel(o.data, undefined, t('shared.dash')) }))
        );
        setTargetOptions(
          tgtRes.items.map((o) => ({ id: o.id, label: objectLabel(o.data, undefined, t('shared.dash')) }))
        );
      } catch {
        setSourceOptions([]);
        setTargetOptions([]);
      }
    };
    loadOptions();
  }, [linkType, t]);

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
      toast.error(t('ontology.linkTypeDetail.toastSelectBoth'));
      return;
    }
    if (formSourceId === formTargetId) {
      toast.error(t('ontology.linkTypeDetail.toastSourceTargetDifferent'));
      return;
    }
    setSaving(true);
    try {
      await createLinkInstance(typeId, {
        source_object_id: formSourceId,
        target_object_id: formTargetId,
      });
      toast.success(t('ontology.linkTypeDetail.toastLinkCreated'));
      closeForm();
      loadInstances();
      loadType();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('ontology.linkTypeDetail.toastCreateFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (inst: LinkInstanceResponse) => {
    if (!typeId) return;
    if (!confirm(t('ontology.linkTypeDetail.deleteConfirm'))) return;
    try {
      await deleteLinkInstance(typeId, inst.id);
      toast.success(t('ontology.linkTypeDetail.toastLinkDeleted'));
      loadInstances();
      loadType();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('ontology.linkTypeDetail.toastDeleteFailed'));
    }
  };

  if (loading || !linkType) {
    return (
      <div className="link-type-detail">
        <p className="link-type-detail-loading">{t('ontology.linkTypeDetail.loading')}</p>
      </div>
    );
  }

  return (
    <div className="link-type-detail">
      <div className="link-type-detail-header">
        <Link to="/links" className="link-type-back">
          <ArrowLeft size={18} />
          <span>{t('ontology.linkTypeDetail.backLinks')}</span>
        </Link>
        <div className="link-type-detail-title-row">
          <h1>{linkType.name}</h1>
          {isAdmin && !linkType.dataset_id && (
            <button type="button" className="btn btn-primary" onClick={openAdd}>
              <Plus size={18} />
              <span>{t('ontology.linkTypeDetail.addLink')}</span>
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
              <th>{t('ontology.linkTypeDetail.colSource')}</th>
              <th>{t('ontology.linkTypeDetail.colTarget')}</th>
              {isAdmin && !linkType.dataset_id && <th className="link-type-actions-col" />}
            </tr>
          </thead>
          <tbody>
            {instances.length === 0 ? (
              <tr>
                <td colSpan={isAdmin && !linkType.dataset_id ? 3 : 2} className="link-type-empty">
                  {isAdmin && !linkType.dataset_id
                    ? t('ontology.linkTypeDetail.emptyAdmin')
                    : linkType.dataset_id
                      ? t('ontology.linkTypeDetail.emptyDataset')
                      : t('ontology.linkTypeDetail.emptyDefault')}
                </td>
              </tr>
            ) : (
              instances.map((inst) => (
                <tr key={inst.id}>
                  <td>{objectLabel(inst.source_data, inst.source_key_value, t('shared.dash'))}</td>
                  <td>{objectLabel(inst.target_data, inst.target_key_value, t('shared.dash'))}</td>
                  {isAdmin && !linkType.dataset_id && (
                    <td className="link-type-actions-col">
                      <button
                        type="button"
                        title={t('ontology.linkTypeDetail.deleteTitle')}
                        aria-label={t('ontology.linkTypeDetail.deleteTitle')}
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
              <h2>{t('ontology.linkTypeDetail.dialogAddLink')}</h2>
              <button type="button" className="link-type-dialog-close" onClick={closeForm}>
                <X size={20} />
              </button>
            </div>
            <div className="link-type-dialog-body">
              <label>
                <span>{t('ontology.linkTypeDetail.sourceLabel', { type: linkType.source_object_type_name })}</span>
                <select
                  value={formSourceId}
                  onChange={(e) => setFormSourceId(e.target.value)}
                >
                  <option value="">{t('ontology.linkTypeDetail.selectSource')}</option>
                  {sourceOptions.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t('ontology.linkTypeDetail.targetLabel', { type: linkType.target_object_type_name })}</span>
                <select
                  value={formTargetId}
                  onChange={(e) => setFormTargetId(e.target.value)}
                >
                  <option value="">{t('ontology.linkTypeDetail.selectTarget')}</option>
                  {targetOptions.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
              </label>
              {sourceOptions.length === 0 && (
                <p className="link-type-no-objects">
                  {t('ontology.linkTypeDetail.noInstances', { type: linkType.source_object_type_name })}
                </p>
              )}
              {targetOptions.length === 0 && sourceOptions.length > 0 && (
                <p className="link-type-no-objects">
                  {t('ontology.linkTypeDetail.noInstances', { type: linkType.target_object_type_name })}
                </p>
              )}
            </div>
            <div className="link-type-dialog-footer">
              <button type="button" className="btn btn-secondary" onClick={closeForm}>
                {t('ontology.linkTypeDetail.cancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!formSourceId || !formTargetId || formSourceId === formTargetId || saving}
                onClick={handleCreate}
              >
                {saving ? t('ontology.linkTypeDetail.creating') : t('ontology.linkTypeDetail.create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
