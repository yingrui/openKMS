import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Bot, Loader2, Settings } from 'lucide-react';
import { toast } from 'sonner';
import {
  getProject,
  getStoredProjectConversationId,
  projectWorkspacePath,
  updateProject,
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
import './ProjectSettings.scss';

type TabId = 'general' | 'agent';

export function ProjectSettings() {
  const { projectId = '' } = useParams<{ projectId: string }>();
  const { t } = useTranslation('agents');
  const { t: ts } = useTranslation('explore');
  const navigate = useNavigate();
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
  const [openkmsVersion, setOpenkmsVersion] = useState('');
  const [skillActionLoading, setSkillActionLoading] = useState(false);

  const connectorKindLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const k of connectorKinds) map.set(k.kind, k.label);
    return map;
  }, [connectorKinds]);

  const tabs = useMemo(
    () => [
      { id: 'general' as const, label: t('settings.tabGeneral'), icon: Settings },
      { id: 'agent' as const, label: t('settings.tabAgent'), icon: Bot },
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
        const openkms = installed.find((s) => s.skill_id === 'openkms');
        setOpenkmsVersion(openkms?.version ?? '');
      })
      .catch((e) => toast.error(String(e)))
      .finally(() => setLoading(false));
  }, [projectId]);

  const openkmsRegistry = registrySkills.find((s) => s.id === 'openkms');
  const openkmsInstalled = installedSkills.find((s) => s.skill_id === 'openkms');

  const refreshInstalled = async () => {
    const installed = await listProjectSkills(projectId);
    setInstalledSkills(installed);
    const openkms = installed.find((s) => s.skill_id === 'openkms');
    setOpenkmsVersion(openkms?.version ?? '');
    const p = await getProject(projectId);
    setProject(p);
    setAgentJson(JSON.stringify(p.settings, null, 2));
  };

  const onInstallOpenkms = async () => {
    setSkillActionLoading(true);
    try {
      await installProjectSkill(projectId, 'openkms', openkmsVersion || undefined);
      toast.success(t('settings.skills.installSuccess', { skill: 'openkms' }));
      await refreshInstalled();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('settings.skills.installError'));
    } finally {
      setSkillActionLoading(false);
    }
  };

  const onUninstallOpenkms = async () => {
    if (!window.confirm(t('settings.skills.uninstallConfirm', { skill: 'openkms' }))) return;
    setSkillActionLoading(true);
    try {
      await uninstallProjectSkill(projectId, 'openkms');
      toast.success(t('settings.skills.uninstallSuccess', { skill: 'openkms' }));
      await refreshInstalled();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('settings.skills.uninstallError'));
    } finally {
      setSkillActionLoading(false);
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

  return (
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
          <section className="project-settings-section">
            <h2>{t('settings.generalHeading')}</h2>
            <div className="project-settings-field">
              <label htmlFor="project-name">{ts('shared.name')}</label>
              <input
                id="project-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('list.namePlaceholder')}
              />
            </div>
            <div className="project-settings-field">
              <label htmlFor="project-description">{ts('shared.description')}</label>
              <textarea
                id="project-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('list.descPlaceholder')}
                rows={4}
              />
            </div>
            <div className="project-settings-field">
              <label htmlFor="project-slug">{t('settings.slug')}</label>
              <input id="project-slug" type="text" value={slug} onChange={(e) => setSlug(e.target.value)} />
              <p className="project-settings-hint">{t('settings.slugHint')}</p>
            </div>
          </section>
        ) : null}

        {activeTab === 'agent' ? (
          <section className="project-settings-section">
            <h2>{t('settings.agentHeading')}</h2>
            <p className="project-settings-hint project-settings-hint--intro">{t('settings.agentHint')}</p>
            <div className="project-settings-field">
              <label className="project-settings-checkbox">
                <input
                  type="checkbox"
                  checked={webSearchEnabled}
                  onChange={(e) => setWebSearchEnabled(e.target.checked)}
                />
                <span>{t('settings.webSearchEnabled')}</span>
              </label>
              <p className="project-settings-hint">{t('settings.webSearchHint')}</p>
            </div>
            {webSearchEnabled ? (
              <div className="project-settings-field">
                <label htmlFor="project-search-connector">{t('settings.searchConnector')}</label>
                <select
                  id="project-search-connector"
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
                {searchConnectors.length === 0 ? (
                  <p className="project-settings-hint">{t('settings.searchConnectorEmpty')}</p>
                ) : null}
              </div>
            ) : null}
            <div className="project-settings-field project-settings-skills">
              <h3>{t('settings.skills.heading')}</h3>
              <p className="project-settings-hint">{t('settings.skills.openkmsHint')}</p>
              {openkmsInstalled ? (
                <p className="project-settings-skills-status">
                  {t('settings.skills.installed', {
                    version: openkmsInstalled.version,
                    hash: shortHash(openkmsInstalled.content_hash),
                  })}
                </p>
              ) : (
                <p className="project-settings-skills-status">{t('settings.skills.notInstalled')}</p>
              )}
              <div className="project-settings-skills-row">
                <label htmlFor="openkms-version">{t('settings.skills.version')}</label>
                <select
                  id="openkms-version"
                  value={openkmsVersion}
                  onChange={(e) => setOpenkmsVersion(e.target.value)}
                  disabled={!openkmsRegistry?.versions.length}
                >
                  <option value="">{t('settings.skills.defaultVersion')}</option>
                  {(openkmsRegistry?.versions ?? []).map((v) => (
                    <option key={v.id} value={v.version}>
                      {v.version}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={skillActionLoading}
                  onClick={() => void onInstallOpenkms()}
                >
                  {openkmsInstalled ? t('settings.skills.update') : t('settings.skills.install')}
                </button>
                {openkmsInstalled ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={skillActionLoading}
                    onClick={() => void onUninstallOpenkms()}
                  >
                    {t('settings.skills.uninstall')}
                  </button>
                ) : null}
              </div>
            </div>
            <div className="project-settings-field">
              <label htmlFor="project-agent-json">{t('settings.agentJsonLabel')}</label>
              <textarea
                id="project-agent-json"
                className="project-settings-json"
                value={agentJson}
                onChange={(e) => setAgentJson(e.target.value)}
                rows={18}
                spellCheck={false}
              />
            </div>
          </section>
        ) : null}

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
      </div>
    </div>
  );
}
