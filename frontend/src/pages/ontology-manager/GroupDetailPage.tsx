import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { fetchObjectTypes, type ObjectTypeResponse } from '../../data/ontologyApi';
import {
  deleteOntologyGroup,
  fetchOntologyGroup,
  updateOntologyGroup,
  type OntologyGroupResponse,
} from '../../data/ontologyFunctionsApi';
import { useConfirm } from '../../contexts/ConfirmContext';
import {
  EntityViewField,
  EntityViewLoading,
  EntityViewPanel,
  EntityViewShell,
} from './EntityViewShell';
import '../ontology/ontology-admin.scss';

export function GroupDetailPage() {
  const { t } = useTranslation('ontology');
  const { groupId = '' } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
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
    if (!groupId) return;
    if (
      !(await confirm({
        title: t('shared.delete'),
        message: t('groups.deleteConfirm', { name: displayName }),
        confirmLabel: t('shared.delete'),
        danger: true,
      }))
    )
      return;
    try {
      await deleteOntologyGroup(groupId);
      toast.success(t('groups.deleted'));
      navigate('/ontology-manager/groups');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('groups.loadFailed'));
    }
  };

  if (loading || !group) {
    return <EntityViewLoading label={t('shared.loading')} />;
  }

  return (
    <EntityViewShell
      backTo="/ontology-manager/groups"
      backLabel={t('groups.backToList')}
      kind={t('groups.kind')}
      title={group.display_name}
      meta={`${t('groups.objectTypes')}: ${group.object_type_ids.length}`}
      sectionTitle={t('groups.overview')}
      sectionSubtitle={t('groups.detailSubtitle')}
      toolbar={
        <>
          <button type="button" className="btn btn-secondary" onClick={() => void onDelete()}>
            <Trash2 size={16} aria-hidden />
            {t('shared.delete')}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void onSave()} disabled={saving}>
            <Save size={16} aria-hidden />
            {saving ? t('shared.saving') : t('shared.save')}
          </button>
        </>
      }
    >
      <EntityViewPanel>
        <div className="entity-view__form">
          <EntityViewField label={t('groups.displayName')}>
            <input
              className="console-form-control"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </EntityViewField>
          <EntityViewField label={t('groups.description')}>
            <textarea
              className="console-form-control"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </EntityViewField>
          <EntityViewField label={t('groups.assignObjectTypes')} as="div">
            {objectTypes.length === 0 ? (
              <p className="entity-view__field-hint">
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
          </EntityViewField>
        </div>
      </EntityViewPanel>
    </EntityViewShell>
  );
}
