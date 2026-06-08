import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Layers, Loader2, Plus, Settings, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import {
  deleteAgentSkill,
  deleteAgentSkillVersion,
  fetchAgentSkill,
  patchAgentSkill,
  shortHash,
  uploadAgentSkillFolder,
  uploadAgentSkillZip,
  type AgentSkill,
} from '../../data/agentSkillsApi';
import '../documents/DocumentChannelSettings.scss';
import './AgentSkillSettings.scss';

type TabId = 'general' | 'versions';

export function AgentSkillSettings() {
  const { t } = useTranslation('agents');
  const { t: ts } = useTranslation('explore');
  const navigate = useNavigate();
  const { skillId = '' } = useParams<{ skillId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<TabId>(tabParam === 'versions' ? 'versions' : 'general');
  const [skill, setSkill] = useState<AgentSkill | null>(null);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState('');
  const [defaultVersion, setDefaultVersion] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newVersion, setNewVersion] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const zipRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  const tabs = useMemo(
    () => [
      { id: 'general' as const, label: t('skills.settings.tabGeneral'), icon: Settings },
      { id: 'versions' as const, label: t('skills.settings.tabVersions'), icon: Layers },
    ],
    [t],
  );

  const load = useCallback(async () => {
    if (!skillId) return;
    setLoading(true);
    try {
      const data = await fetchAgentSkill(skillId);
      setSkill(data);
      setDisplayName(data.display_name);
      setDefaultVersion(data.default_version ?? '');
      setIsDefault(data.is_default);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('skills.settings.loadFailed'));
      setSkill(null);
    } finally {
      setLoading(false);
    }
  }, [skillId, t]);

  useEffect(() => {
    if (!skillId) {
      navigate('/agents/skills');
      return;
    }
    void load();
  }, [skillId, load, navigate]);

  useEffect(() => {
    if (tabParam === 'versions' || tabParam === 'general') {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  const selectTab = (tab: TabId) => {
    setActiveTab(tab);
    if (tab === 'general') {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ tab }, { replace: true });
    }
  };

  const handleSave = async () => {
    if (!skillId || !skill) return;
    const name = displayName.trim();
    if (!name) {
      toast.error(t('skills.settings.displayNameRequired'));
      return;
    }
    setSaving(true);
    try {
      const updated = await patchAgentSkill(skillId, {
        display_name: name,
        default_version: defaultVersion.trim() || null,
        is_default: isDefault,
      });
      setSkill(updated);
      setDisplayName(updated.display_name);
      setDefaultVersion(updated.default_version ?? '');
      setIsDefault(updated.is_default);
      toast.success(t('skills.settings.saveSuccess'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('skills.settings.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const runUpload = async (mode: 'zip' | 'folder', file?: File, fileList?: FileList) => {
    if (!skillId || !newVersion.trim()) {
      toast.error(t('skills.uploadFieldsRequired'));
      return;
    }
    setUploading(true);
    try {
      if (mode === 'zip' && file) {
        await uploadAgentSkillZip({
          skillId,
          version: newVersion.trim(),
          notes: newNotes.trim() || undefined,
          file,
        });
      } else if (mode === 'folder' && fileList?.length) {
        const files = Array.from(fileList);
        const relativePaths = files.map((f) => {
          const w = (f as File & { webkitRelativePath?: string }).webkitRelativePath;
          return w || f.name;
        });
        await uploadAgentSkillFolder({
          skillId,
          version: newVersion.trim(),
          notes: newNotes.trim() || undefined,
          files,
          relativePaths,
        });
      } else {
        return;
      }
      toast.success(t('skills.uploadSuccess'));
      setNewVersion('');
      setNewNotes('');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('skills.uploadError'));
    } finally {
      setUploading(false);
    }
  };

  const onDeleteVersion = async (ver: string) => {
    if (!skillId || !window.confirm(t('skills.deleteVersionConfirm', { skillId, version: ver }))) return;
    try {
      await deleteAgentSkillVersion(skillId, ver);
      toast.success(t('skills.deleteSuccess'));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('skills.deleteError'));
    }
  };

  const handleDeleteSkill = async () => {
    if (!skillId || !skill) return;
    if (!window.confirm(t('skills.deleteSkillConfirm', { name: skill.display_name, skillId }))) return;
    setDeleting(true);
    try {
      await deleteAgentSkill(skillId);
      toast.success(t('skills.deleteSkillSuccess'));
      navigate('/agents/skills');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('skills.deleteSkillError'));
    } finally {
      setDeleting(false);
    }
  };

  if (!skillId) return null;

  if (loading) {
    return (
      <div className="agent-skill-settings document-channel-settings">
        <p className="page-subtitle">{t('skills.settings.loading')}</p>
      </div>
    );
  }

  if (!skill) {
    return (
      <div className="agent-skill-settings document-channel-settings">
        <Link to="/agents/skills" className="document-channel-settings-back">
          <ArrowLeft size={18} />
          <span>{t('skills.settings.backToSkills')}</span>
        </Link>
        <div className="page-header">
          <h1>{t('skills.settings.notFoundTitle')}</h1>
          <p className="page-subtitle">{t('skills.settings.notFoundSubtitle')}</p>
        </div>
      </div>
    );
  }

  const sortedVersions = [...skill.versions].sort((a, b) => {
    const ta = a.created_at ? Date.parse(a.created_at) : 0;
    const tb = b.created_at ? Date.parse(b.created_at) : 0;
    return tb - ta;
  });

  return (
    <div className="agent-skill-settings document-channel-settings">
      <Link to="/agents/skills" className="document-channel-settings-back">
        <ArrowLeft size={18} />
        <span>{t('skills.settings.backToSkills')}</span>
      </Link>

      <div className="page-header">
        <h1>{t('skills.settings.pageTitle')}</h1>
        <p className="page-subtitle">{t('skills.settings.configureSubtitle', { name: skill.display_name })}</p>
      </div>

      <div className="document-channel-settings-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`document-channel-settings-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => selectTab(tab.id)}
          >
            <tab.icon size={16} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="document-channel-settings-form">
        {activeTab === 'general' ? (
          <section className="document-channel-settings-section">
            <h2>{t('skills.settings.generalHeading')}</h2>
            <p className="document-channel-settings-hint">{t('skills.settings.generalHint')}</p>
            <div className="document-channel-settings-field">
              <label htmlFor="skill-settings-id">{t('skills.skillId')}</label>
              <input id="skill-settings-id" type="text" value={skill.id} readOnly disabled />
            </div>
            <div className="document-channel-settings-field">
              <label htmlFor="skill-settings-display-name">{t('skills.displayName')}</label>
              <input
                id="skill-settings-display-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="document-channel-settings-field">
              <label htmlFor="skill-settings-default-version">{t('skills.defaultVersion')}</label>
              <select
                id="skill-settings-default-version"
                value={defaultVersion}
                onChange={(e) => setDefaultVersion(e.target.value)}
              >
                <option value="">{t('skills.latestVersion')}</option>
                {skill.versions.map((v) => (
                  <option key={v.id} value={v.version}>
                    {v.version}
                  </option>
                ))}
              </select>
              <p className="document-channel-settings-hint">{t('skills.settings.defaultVersionHint')}</p>
            </div>
            <div className="document-channel-settings-field">
              <label className="agent-skill-settings-default-install">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                />
                <span>{t('skills.defaultForNewProjects')}</span>
              </label>
              <p className="document-channel-settings-hint">{t('skills.settings.defaultInstallHint')}</p>
            </div>
            {skill.created_by_name ? (
              <p className="document-channel-settings-hint">
                {t('skills.createdBy', { name: skill.created_by_name })}
              </p>
            ) : null}
            <div className="document-channel-settings-actions">
              <button type="button" className="btn btn-primary" onClick={() => void handleSave()} disabled={saving}>
                {saving ? ts('shared.saving') : ts('shared.save')}
              </button>
            </div>
          </section>
        ) : null}

        {activeTab === 'versions' ? (
          <section className="document-channel-settings-section">
            <h2>{t('skills.settings.versionsHeading')}</h2>
            <p className="document-channel-settings-hint">{t('skills.settings.versionsHint')}</p>

            <div className="agent-skill-settings-upload">
              <div className="document-channel-settings-field">
                <label htmlFor="skill-settings-new-version">{t('skills.version')}</label>
                <input
                  id="skill-settings-new-version"
                  type="text"
                  value={newVersion}
                  onChange={(e) => setNewVersion(e.target.value)}
                  placeholder="1.0.0"
                  autoComplete="off"
                />
              </div>
              <div className="document-channel-settings-field">
                <label htmlFor="skill-settings-new-notes">{t('skills.notes')}</label>
                <input
                  id="skill-settings-new-notes"
                  type="text"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="agent-skill-settings-upload-actions">
                <input
                  ref={zipRef}
                  type="file"
                  accept=".zip,application/zip"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void runUpload('zip', f);
                    e.target.value = '';
                  }}
                />
                <input
                  ref={folderRef}
                  type="file"
                  hidden
                  multiple
                  // @ts-expect-error webkitdirectory is non-standard but widely supported
                  webkitdirectory=""
                  onChange={(e) => {
                    if (e.target.files?.length) void runUpload('folder', undefined, e.target.files);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={uploading || !newVersion.trim()}
                  onClick={() => zipRef.current?.click()}
                >
                  {uploading ? <Loader2 size={16} className="agent-skill-settings-spin" /> : <Upload size={16} />}
                  {t('skills.uploadZip')}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={uploading || !newVersion.trim()}
                  onClick={() => folderRef.current?.click()}
                >
                  {uploading ? <Loader2 size={16} className="agent-skill-settings-spin" /> : <Plus size={16} />}
                  {t('skills.uploadFolder')}
                </button>
              </div>
            </div>

            {sortedVersions.length === 0 ? (
              <p className="document-channel-settings-hint">{t('skills.settings.noVersions')}</p>
            ) : (
              <table className="agent-skill-settings-versions">
                <thead>
                  <tr>
                    <th>{t('skills.version')}</th>
                    <th>{t('skills.uploadedBy')}</th>
                    <th>{t('skills.hash')}</th>
                    <th>{t('skills.notes')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {sortedVersions.map((v) => (
                    <tr key={v.id}>
                      <td>
                        <code>{v.version}</code>
                        {skill.default_version === v.version ? (
                          <span className="agent-skill-settings-default-badge">{t('skills.defaultVersion')}</span>
                        ) : null}
                      </td>
                      <td>{v.uploaded_by_name ?? '—'}</td>
                      <td>
                        <code title={v.content_hash}>{shortHash(v.content_hash)}</code>
                      </td>
                      <td>{v.notes ?? '—'}</td>
                      <td>
                        <button
                          type="button"
                          className="agent-skill-settings-delete"
                          aria-label={t('skills.deleteVersion')}
                          onClick={() => void onDeleteVersion(v.version)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        ) : null}
      </div>

      <section className="agent-skill-settings-danger document-channel-settings-form">
        <h2>{t('skills.settings.dangerZone')}</h2>
        <p className="document-channel-settings-hint">{t('skills.settings.dangerHint')}</p>
        <button
          type="button"
          className="btn agent-skill-settings-delete-skill"
          disabled={deleting}
          onClick={() => void handleDeleteSkill()}
        >
          {deleting ? t('skills.settings.deleting') : t('skills.settings.deleteSkill')}
        </button>
      </section>
    </div>
  );
}
