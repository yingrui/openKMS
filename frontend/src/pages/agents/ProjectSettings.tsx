import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Bot, CalendarClock, KeyRound, Loader2, Puzzle, Settings, Users } from 'lucide-react';
import { toast } from 'sonner';
import {
  getProject,
  getStoredProjectConversationId,
  projectWorkspacePath,
  setStoredProjectConversationId,
  updateProject,
  deleteProject,
  type ProjectResponse,
} from '../../data/projectsApi';
import {
  installProjectSkill,
  listAgentSkills,
  listProjectSkills,
  shortHash,
  uninstallProjectSkill,
  type AgentSkill,
  type ProjectInstalledSkill,
} from '../../data/agentSkillsApi';
import {
  fetchConnectorKinds,
  fetchConnectors,
  type ConnectorKindOut,
  type ConnectorResponse,
} from '../../data/connectorsApi';
import { AgentsSettingsSkeleton } from '../../components/agents/AgentsPageSkeleton';
import { ProjectSchedulesTab } from '../../components/agents/ProjectSchedulesTab';
import { ProjectDeploySecretsTab } from '../../components/agents/ProjectDeploySecretsTab';
import { ProjectGitRemoteSection } from '../../components/agents/ProjectGitRemoteSection';
import { ContentCommentsShell } from '../../components/comments/ContentCommentsShell';
import { ResourceSharePanel } from '../../components/ResourceSharePanel';
import { RESOURCE_TYPES } from '../../data/resourceAclApi';
import { useConfirm } from '../../contexts/ConfirmContext';
import { CheckRow, FormField } from '../../styles/design-system';
import './ProjectSettings.scss';

type TabId = 'general' | 'agent' | 'skills' | 'schedules' | 'sharing' | 'deploy';

export function ProjectSettings() {
  const { projectId = '' } = useParams<{ projectId: string }>();
  const { t } = useTranslation('agents');
  const { t: ts } = useTranslation('explore');
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('general');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [slug, setSlug] = useState('');
  const [agentJson, setAgentJson] = useState('{}');
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [searchConnectorId, setSearchConnectorId] = useState('');
  const [searchConnectors, setSearchConnectors] = useState<ConnectorResponse[]>([]);
  const [connectorKinds, setConnectorKinds] = useState<ConnectorKindOut[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registrySkills, setRegistrySkills] = useState<AgentSkill[]>([]);
  const [installedSkills, setInstalledSkills] = useState<ProjectInstalledSkill[]>([]);
  const [selectedVersions, setSelectedVersions] = useState<Record<string, string>>({});
  const [skillActionLoading, setSkillActionLoading] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const connectorKindLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const k of connectorKinds) map.set(k.kind, k.label);
    return map;
  }, [connectorKinds]);

  const tabs = useMemo(
    () => [
      { id: 'general' as const, label: t('settings.tabGeneral'), icon: Settings },
      { id: 'agent' as const, label: t('settings.tabAgent'), icon: Bot },
      { id: 'skills' as const, label: t('settings.tabSkills'), icon: Puzzle },
      { id: 'deploy' as const, label: t('settings.tabDeploy'), icon: KeyRound },
      { id: 'sharing' as const, label: t('settings.tabSharing'), icon: Users },
      { id: 'schedules' as const, label: t('settings.tabSchedules'), icon: CalendarClock },
    ],
    [t],
  );

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getProject(projectId),
      fetchConnectors('search_tool').catch(() => ({ items: [], total: 0 })),
      fetchConnectorKinds('search_tool').catch(() => []),
      listAgentSkills().catch(() => []),
      listProjectSkills(projectId).catch(() => []),
    ])
      .then(([p, connectors, kinds, skills, installed]) => {
        setProject(p);
        setName(p.name);
        setDescription(p.description ?? '');
        setSlug(p.slug);
        setAgentJson(JSON.stringify(p.settings, null, 2));
        setWebSearchEnabled(Boolean(p.settings?.web_search));
        setSearchConnectorId(String(p.settings?.search_connector_id ?? ''));
        setSearchConnectors(connectors.items.filter((c) => c.enabled));
        setConnectorKinds(kinds);
        setRegistrySkills(skills);
        setInstalledSkills(installed);
        const versions: Record<string, string> = {};
        for (const row of installed) {
          versions[row.skill_id] = row.version;
        }
        setSelectedVersions(versions);
      })
      .catch((e) => toast.error(String(e)))
      .finally(() => setLoading(false));
  }, [projectId]);

  const refreshInstalled = async () => {
    const installed = await listProjectSkills(projectId);
    setInstalledSkills(installed);
    setSelectedVersions((prev) => {
      const next = { ...prev };
      for (const row of installed) {
        next[row.skill_id] = row.version;
      }
      return next;
    });
    const p = await getProject(projectId);
    setProject(p);
    setAgentJson(JSON.stringify(p.settings, null, 2));
  };

  const onInstallSkill = async (skill: AgentSkill) => {
    setSkillActionLoading(skill.id);
    try {
      await installProjectSkill(projectId, skill.id, selectedVersions[skill.id] || undefined);
      toast.success(t('settings.skills.installSuccess', { skill: skill.display_name }));
      await refreshInstalled();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('settings.skills.installError'));
    } finally {
      setSkillActionLoading(null);
    }
  };

  const onUninstallSkill = async (skill: AgentSkill) => {
    if (
      !(await confirm({
        title: t('settings.skills.uninstall'),
        message: t('settings.skills.uninstallConfirm', { skill: skill.display_name }),
        confirmLabel: t('settings.skills.uninstall'),
        danger: true,
      }))
    )
      return;
    setSkillActionLoading(skill.id);
    try {
      await uninstallProjectSkill(projectId, skill.id);
      toast.success(t('settings.skills.uninstallSuccess', { skill: skill.display_name }));
      await refreshInstalled();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('settings.skills.uninstallError'));
    } finally {
      setSkillActionLoading(null);
    }
  };

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      let settings: Record<string, unknown>;
      try {
        settings = JSON.parse(agentJson) as Record<string, unknown>;
      } catch {
        throw new Error(t('settings.invalidJson'));
      }
      if (webSearchEnabled && !searchConnectorId.trim()) {
        throw new Error(t('settings.searchConnectorRequired'));
      }
      settings.web_search = webSearchEnabled;
      settings.search_connector_id = webSearchEnabled ? searchConnectorId.trim() : null;
      await updateProject(projectId, {
        name: name.trim(),
        description: description.trim() || null,
        slug: slug.trim() || undefined,
        settings,
      });
      toast.success(t('settings.saved'));
      navigate(projectWorkspacePath(projectId, getStoredProjectConversationId(projectId)));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const onDeleteProject = async () => {
    if (
      !(await confirm({
        title: t('settings.deleteProject'),
        message: t('settings.deleteConfirm', { name: project?.name ?? name }),
        confirmLabel: t('settings.deleteProject'),
        danger: true,
      }))
    )
      return;
    setDeleting(true);
    try {
      await deleteProject(projectId);
      setStoredProjectConversationId(projectId, null);
      toast.success(t('settings.deleteSuccess'));
      navigate('/agents');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('settings.deleteError'));
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return <AgentsSettingsSkeleton />;
  }

  if (!project) {
    return (
      <div className="project-settings">
        <p className="project-settings-loading">{t('settings.notFound')}</p>
      </div>
    );
  }

  const saveBar = (
    <>
      {error ? <p className="project-settings-error">{error}</p> : null}
      <div className="project-settings-actions">
        <button type="button" className="btn btn-primary" disabled={saving || !name.trim()} onClick={() => void save()}>
          {saving ? (
            <>
              <Loader2 size={16} className="project-settings-spinner" />
              {t('settings.saving')}
            </>
          ) : (
            t('settings.save')
          )}
        </button>
      </div>
    </>
  );

  return (
    <ContentCommentsShell resourceType="project" resourceId={projectId}>
    <div className="project-settings">
      <Link
        to={projectWorkspacePath(projectId, getStoredProjectConversationId(projectId))}
        className="project-settings-back"
      >
        <ArrowLeft size={18} />
        <span>{t('settings.backToWorkspace')}</span>
      </Link>

      <div className="page-header">
        <h1>{t('settings.pageTitle')}</h1>
        <p className="page-subtitle">{t('settings.pageSubtitle', { name: project.name })}</p>
      </div>

      <div className="project-settings-tabs" role="tablist" aria-label={t('settings.pageTitle')}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`project-settings-tab${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <tab.icon size={16} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="project-settings-form" role="tabpanel">
        {activeTab === 'general' ? (
          <>
            <section className="project-settings-section">
              <h2>{t('settings.generalHeading')}</h2>
              <FormField label={ts('shared.name')} htmlFor="project-name">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('list.namePlaceholder')}
                  autoComplete="off"
                />
              </FormField>
              <FormField label={ts('shared.description')} htmlFor="project-description">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('list.descPlaceholder')}
                  rows={4}
                />
              </FormField>
              <FormField label={t('settings.slug')} hint={t('settings.slugHint')} htmlFor="project-slug">
                <input type="text" value={slug} onChange={(e) => setSlug(e.target.value)} autoComplete="off" />
              </FormField>
            </section>
            <ProjectGitRemoteSection
              project={project}
              onProjectChange={(p) => {
                setProject(p);
                setAgentJson(JSON.stringify(p.settings, null, 2));
              }}
            />
            {saveBar}
          </>
        ) : null}

        {activeTab === 'agent' ? (
          <>
          <section className="project-settings-section">
            <h2>{t('settings.agentHeading')}</h2>
            <p className="project-settings-hint project-settings-hint--intro">{t('settings.agentHint')}</p>
            <CheckRow
              checked={webSearchEnabled}
              onChange={setWebSearchEnabled}
              title={t('settings.webSearchEnabled')}
              hint={t('settings.webSearchHint')}
            />
            {webSearchEnabled ? (
              <FormField
                label={t('settings.searchConnector')}
                htmlFor="project-search-connector"
                hint={searchConnectors.length === 0 ? t('settings.searchConnectorEmpty') : undefined}
              >
                <select
                  value={searchConnectorId}
                  onChange={(e) => setSearchConnectorId(e.target.value)}
                >
                  <option value="">{t('settings.searchConnectorPlaceholder')}</option>
                  {searchConnectors.map((c) => {
                    const kindLabel = connectorKindLabels.get(c.kind);
                    const label = kindLabel ? `${c.name} · ${kindLabel}` : c.name;
                    return (
                      <option key={c.id} value={c.id}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              </FormField>
            ) : null}
            <FormField label={t('settings.agentJsonLabel')} htmlFor="project-agent-json">
              <textarea
                className="ds-control--mono"
                value={agentJson}
                onChange={(e) => setAgentJson(e.target.value)}
                rows={18}
                spellCheck={false}
              />
            </FormField>
          </section>
          {saveBar}
          </>
        ) : null}

        {activeTab === 'skills' ? (
          <section className="project-settings-section project-settings-skills-tab">
            <h2>{t('settings.skills.heading')}</h2>
            <p className="project-settings-hint project-settings-hint--intro">{t('settings.skills.hint')}</p>
            {registrySkills.length === 0 ? (
              <p className="project-settings-skills-empty">
                {t('settings.skills.registryEmpty')}{' '}
                <Link to="/agents/skills">{t('settings.skills.uploadSkills')}</Link>
              </p>
            ) : (
              <div className="ds-table-wrap">
                <table className="project-settings-skills-table">
                  <thead>
                    <tr>
                      <th>{t('settings.skills.colSkill')}</th>
                      <th>{t('settings.skills.colStatus')}</th>
                      <th>{t('settings.skills.colVersion')}</th>
                      <th>{t('settings.skills.colActions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registrySkills.map((skill) => {
                      const installed = installedSkills.find((s) => s.skill_id === skill.id);
                      const loading = skillActionLoading === skill.id;
                      return (
                        <tr key={skill.id}>
                          <td className="project-settings-skills-table-skill">
                            <span className="project-settings-skills-table-name">{skill.display_name}</span>
                            <code>{skill.id}</code>
                          </td>
                          <td>
                            {installed ? (
                              <span className="project-settings-skills-badge project-settings-skills-badge--installed">
                                {t('settings.skills.statusInstalled')}
                              </span>
                            ) : (
                              <span className="project-settings-skills-badge project-settings-skills-badge--missing">
                                {t('settings.skills.statusNotInstalled')}
                              </span>
                            )}
                            {installed ? (
                              <span className="project-settings-skills-table-installed-meta">
                                {t('settings.skills.installedMeta', {
                                  version: installed.version,
                                  hash: shortHash(installed.content_hash),
                                })}
                              </span>
                            ) : null}
                          </td>
                          <td>
                            <select
                              id={`skill-version-${skill.id}`}
                              className="project-settings-skills-table-select"
                              value={selectedVersions[skill.id] ?? ''}
                              onChange={(e) =>
                                setSelectedVersions((prev) => ({ ...prev, [skill.id]: e.target.value }))
                              }
                              disabled={!skill.versions.length || loading}
                              aria-label={t('settings.skills.versionFor', { skill: skill.display_name })}
                            >
                              <option value="">{t('settings.skills.defaultVersion')}</option>
                              {skill.versions.map((v) => (
                                <option key={v.id} value={v.version}>
                                  {v.version}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="project-settings-skills-table-actions">
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              disabled={loading || skill.versions.length === 0}
                              onClick={() => void onInstallSkill(skill)}
                            >
                              {loading ? (
                                <Loader2 size={14} className="project-settings-spinner" />
                              ) : installed ? (
                                t('settings.skills.update')
                              ) : (
                                t('settings.skills.install')
                              )}
                            </button>
                            {installed ? (
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                disabled={loading}
                                onClick={() => void onUninstallSkill(skill)}
                              >
                                {t('settings.skills.uninstall')}
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}

        {activeTab === 'deploy' ? <ProjectDeploySecretsTab projectId={projectId} /> : null}

        {activeTab === 'schedules' ? <ProjectSchedulesTab projectId={projectId} /> : null}

        {activeTab === 'sharing' ? (
          <section className="project-settings-section">
            <ResourceSharePanel
              resourceType={RESOURCE_TYPES.project}
              resourceId={projectId}
              title={t('settings.sharingTitle')}
            />
          </section>
        ) : null}
      </div>

      {activeTab === 'general' ? (
        <section className="project-settings-danger">
          <h2>{t('settings.dangerZone')}</h2>
          <p className="project-settings-hint">{t('settings.dangerHint')}</p>
          <button
            type="button"
            className="btn project-settings-delete"
            disabled={deleting}
            onClick={() => void onDeleteProject()}
          >
            {deleting ? t('settings.deleting') : t('settings.deleteProject')}
          </button>
        </section>
      ) : null}
    </div>
    </ContentCommentsShell>
  );
}
