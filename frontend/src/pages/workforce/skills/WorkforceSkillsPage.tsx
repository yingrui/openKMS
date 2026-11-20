import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { PackagePlus, Puzzle } from 'lucide-react';
import { toast } from 'sonner';
import { WorkforceAreaNav } from '../../../components/workforce/WorkforceAreaNav';
import {
  createWorkforceSkill,
  listWorkforceSkillRegistry,
  type WorkforceSkillListItem,
} from '../../../data/workforceSkillsApi';
import {
  Dialog,
  EmptyState,
  FormField,
  ListPage,
  ResourceViewToggle,
} from '../../../styles/design-system';
import { useStoredViewMode, type CardListViewMode } from '../../../hooks/useStoredViewMode';
import './workforceSkills.scss';

const VIEW_STORAGE_KEY = 'workforce-skills-view';

/**
 * The workforce skill registry: what an agent can carry, written here rather than uploaded.
 *
 * Same page shape as the agents list — title, one action, a view switch, then cards or a table. The two lists sit
 * side by side in the same area, so a reader should not have to relearn the page to move between them.
 */
export function WorkforceSkillsPage() {
  const { t } = useTranslation('workforce');
  const [viewMode, setViewMode] = useStoredViewMode<CardListViewMode>(VIEW_STORAGE_KEY, 'card');
  const [skills, setSkills] = useState<WorkforceSkillListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [skillId, setSkillId] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSkills(await listWorkforceSkillRegistry());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('skills.registryLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const closeCreate = () => {
    setShowCreate(false);
    setSkillId('');
    setName('');
  };

  const submit = async () => {
    if (!skillId.trim()) {
      toast.error(t('skills.idRequired'));
      return;
    }
    setSaving(true);
    try {
      await createWorkforceSkill({ id: skillId.trim(), name: name.trim() || skillId.trim() });
      closeCreate();
      toast.success(t('skills.created'));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('skills.createFailed'));
    } finally {
      setSaving(false);
    }
  };

  const isCardView = viewMode === 'card';

  return (
    <ListPage
      title={t('skills.registryTitle')}
      subtitle={t('skills.registryLead')}
      actions={
        <>
          {!loading && skills.length > 0 ? (
            <ResourceViewToggle
              modes={['card', 'list']}
              value={viewMode}
              onChange={setViewMode}
            />
          ) : null}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowCreate(true)}
            aria-label={t('skills.newSkill')}
          >
            <PackagePlus size={18} aria-hidden />
            <span className="ds-compact-label">{t('skills.newSkill')}</span>
          </button>
        </>
      }
    >
      <WorkforceAreaNav />

      {loading && <p className="ds-resource-list-loading">{t('loading')}</p>}

      {!loading && skills.length === 0 && (
        <EmptyState
          icon={<Puzzle size={48} strokeWidth={1} />}
          description={t('skills.registryEmpty')}
          action={
            <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>
              {t('skills.newSkill')}
            </button>
          }
        />
      )}

      {!loading && skills.length > 0 && isCardView && (
        <div className="ds-resource-list-grid">
          {skills.map((skill) => (
            <Link
              key={skill.id}
              to={`/workforce/skills/${skill.id}`}
              className="ds-resource-list-card workforce-skill-card"
            >
              <div className="ds-resource-list-card-top">
                <div className="ds-resource-list-icon">
                  <Puzzle size={28} strokeWidth={1.5} />
                </div>
              </div>
              <h3>{skill.name}</h3>
              <p className="ds-resource-list-desc">{skill.description || t('skills.noDescription')}</p>
              <div className="ds-resource-list-meta">
                <span>
                  {skill.latest_version
                    ? t('skills.chipVersion', { version: skill.latest_version })
                    : t('skills.chipUnpublished')}
                </span>
                {skill.has_draft ? <span>{t('skills.chipDraft')}</span> : null}
                <span>{skill.id}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {!loading && skills.length > 0 && !isCardView && (
        <div className="ds-resource-table-wrap">
          <table className="ds-resource-table">
            <thead>
              <tr>
                <th>{t('skills.nameLabel')}</th>
                <th>{t('skills.versions')}</th>
                <th>{t('skills.idLabel')}</th>
              </tr>
            </thead>
            <tbody>
              {skills.map((skill) => (
                <tr key={skill.id}>
                  <td>
                    <Link
                      to={`/workforce/skills/${skill.id}`}
                      className="ds-resource-table__link"
                    >
                      {skill.name}
                    </Link>
                    <div className="page-subtitle">
                      {skill.description || t('skills.noDescription')}
                    </div>
                  </td>
                  <td>
                    {skill.latest_version
                      ? t('skills.chipVersion', { version: skill.latest_version })
                      : t('skills.chipUnpublished')}
                    {skill.has_draft ? ` · ${t('skills.chipDraft')}` : ''}
                  </td>
                  <td>
                    <code>{skill.id}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={showCreate}
        onClose={closeCreate}
        title={t('skills.newSkill')}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={closeCreate}>
              {t('cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void submit()}
              disabled={saving || !skillId.trim()}
            >
              {saving ? t('creating') : t('create')}
            </button>
          </>
        }
      >
        <FormField label={t('skills.idLabel')} hint={t('skills.idHint')}>
          <input
            className="ds-control"
            value={skillId}
            placeholder={t('skills.idPlaceholder')}
            onChange={(e) => setSkillId(e.target.value)}
          />
        </FormField>
        <FormField label={t('skills.nameLabel')}>
          <input
            className="ds-control"
            value={name}
            placeholder={t('skills.namePlaceholder')}
            onChange={(e) => setName(e.target.value)}
          />
        </FormField>
      </Dialog>
    </ListPage>
  );
}
