import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Loader2, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { fetchObjectTypes, type ObjectTypeResponse } from '../../data/ontologyApi';
import {
  deleteOntologyGroup,
  fetchOntologyGroup,
  updateOntologyGroup,
  type OntologyGroupResponse,
} from '../../data/ontologyFunctionsApi';
import '../ontology/ontology-admin.scss';
import './entity-view.scss';

export function GroupDetailPage() {
  const { t } = useTranslation('ontology');
  const { groupId = '' } = useParams();
  const navigate = useNavigate();
  const [group, setGroup] = useState<OntologyGroupResponse | null>(null);
  const [objectTypes, setObjectTypes] = useState<ObjectTypeResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedTypeIds, setSelectedTypeIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!groupId) return;
    setLoading(true);
    try {
      const [g, typesRes] = await Promise.all([fetchOntologyGroup(groupId), fetchObjectTypes()]);
      setGroup(g);
      setObjectTypes(typesRes.items);
      setDisplayName(g.display_name);
      setDescription(g.description ?? '');
      setSelectedTypeIds(new Set(g.object_type_ids));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('groups.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [groupId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleType = (typeId: string) => {
    setSelectedTypeIds((prev) => {
      const next = new Set(prev);
      if (next.has(typeId)) next.delete(typeId);
      else next.add(typeId);
      return next;
    });
  };

  const onSave = async () => {
    if (!groupId) return;
    setSaving(true);
    try {
      const updated = await updateOntologyGroup(groupId, {
        display_name: displayName.trim(),
        description: description.trim() || undefined,
        object_type_ids: [...selectedTypeIds],
      });
      setGroup(updated);
      toast.success(t('groups.saved'));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('groups.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!groupId || !window.confirm(t('groups.deleteConfirm', { name: displayName }))) return;
    try {
      await deleteOntologyGroup(groupId);
      toast.success(t('groups.deleted'));
      navigate('/ontology-manager/groups');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('groups.loadFailed'));
    }
  };

  if (loading || !group) {
    return (
      <div className="console-loading">
        <Loader2 size={32} className="console-loading-spinner" aria-hidden />
        <p>{t('shared.loading')}</p>
      </div>
    );
  }

  return (
    <div className="entity-view">
      <aside className="entity-view__sidebar">
        <button type="button" className="entity-view__back" onClick={() => navigate('/ontology-manager/groups')}>
          <ArrowLeft size={16} aria-hidden />
          {t('groups.backToList')}
        </button>
        <h2 className="entity-view__title">{group.display_name}</h2>
        <p className="entity-view__meta">{t('groups.objectTypes')}: {group.object_type_ids.length}</p>
      </aside>
      <div className="entity-view__main">
        <header className="page-header">
          <div>
            <h1>{group.display_name}</h1>
            <p className="page-subtitle">{t('groups.detailSubtitle')}</p>
          </div>
          <div className="entity-view__actions">
            <button type="button" className="btn btn-secondary" onClick={() => void onDelete()}>
              <Trash2 size={16} aria-hidden />
              {t('shared.delete')}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void onSave()} disabled={saving}>
              <Save size={16} aria-hidden />
              {saving ? t('shared.saving') : t('shared.save')}
            </button>
          </div>
        </header>
        <div className="entity-view__form">
          <label className="console-form-field">
            <span>{t('groups.displayName')}</span>
            <input
              className="console-form-control"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </label>
          <label className="console-form-field">
            <span>{t('groups.description')}</span>
            <input
              className="console-form-control"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <div className="console-form-field">
            <span>{t('groups.assignObjectTypes')}</span>
            {objectTypes.length === 0 ? (
              <p className="console-modal-hint">
                {t('groups.noObjectTypes')}{' '}
                <Link to="/ontology-manager/object-types">{t('groups.createObjectTypes')}</Link>
              </p>
            ) : (
              <ul className="entity-view__checkbox-list">
                {objectTypes.map((ot) => (
                  <li key={ot.id}>
                    <label className="console-modal-checkbox-row">
                      <input
                        type="checkbox"
                        checked={selectedTypeIds.has(ot.id)}
                        onChange={() => toggleType(ot.id)}
                      />
                      <span>{ot.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
