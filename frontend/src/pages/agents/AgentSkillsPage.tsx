import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { AgentsAreaNav } from '../../components/agents/AgentsAreaNav';
import { AgentsListSkeleton } from '../../components/agents/AgentsPageSkeleton';
import {
  deleteAgentSkillVersion,
  listAgentSkills,
  patchAgentSkill,
  shortHash,
  uploadAgentSkillFolder,
  uploadAgentSkillZip,
  type AgentSkill,
} from '../../data/agentSkillsApi';
import './AgentSkillsPage.scss';

export function AgentSkillsPage() {
  const { t } = useTranslation('agents');
  const [skills, setSkills] = useState<AgentSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [skillId, setSkillId] = useState('openkms');
  const [version, setVersion] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [notes, setNotes] = useState('');
  const zipRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(() => {
    setLoading(true);
    listAgentSkills()
      .then(setSkills)
      .catch((e) => toast.error(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const onUploadZip = async (file: File) => {
    if (!skillId.trim() || !version.trim()) {
      toast.error(t('skills.uploadFieldsRequired'));
      return;
    }
    setUploading(true);
    try {
      await uploadAgentSkillZip({
        skillId: skillId.trim(),
        version: version.trim(),
        displayName: displayName.trim() || undefined,
        notes: notes.trim() || undefined,
        file,
      });
      toast.success(t('skills.uploadSuccess'));
      setVersion('');
      setNotes('');
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('skills.uploadError'));
    } finally {
      setUploading(false);
    }
  };

  const onUploadFolder = async (fileList: FileList) => {
    if (!skillId.trim() || !version.trim()) {
      toast.error(t('skills.uploadFieldsRequired'));
      return;
    }
    const files = Array.from(fileList);
    const relativePaths = files.map((f) => {
      const w = (f as File & { webkitRelativePath?: string }).webkitRelativePath;
      return w || f.name;
    });
    setUploading(true);
    try {
      await uploadAgentSkillFolder({
        skillId: skillId.trim(),
        version: version.trim(),
        displayName: displayName.trim() || undefined,
        notes: notes.trim() || undefined,
        files,
        relativePaths,
      });
      toast.success(t('skills.uploadSuccess'));
      setVersion('');
      setNotes('');
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('skills.uploadError'));
    } finally {
      setUploading(false);
    }
  };

  const toggleDefault = async (skill: AgentSkill, checked: boolean) => {
    try {
      const updated = await patchAgentSkill(skill.id, { is_default: checked });
      setSkills((prev) => prev.map((s) => (s.id === skill.id ? updated : s)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('skills.patchError'));
    }
  };

  const setDefaultVersion = async (skill: AgentSkill, ver: string) => {
    try {
      const updated = await patchAgentSkill(skill.id, { default_version: ver || null });
      setSkills((prev) => prev.map((s) => (s.id === skill.id ? updated : s)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('skills.patchError'));
    }
  };

  const onDeleteVersion = async (skillId: string, ver: string) => {
    if (!window.confirm(t('skills.deleteVersionConfirm', { skillId, version: ver }))) return;
    try {
      await deleteAgentSkillVersion(skillId, ver);
      toast.success(t('skills.deleteSuccess'));
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('skills.deleteError'));
    }
  };

  return (
    <div className="agent-skills-page page">
      <AgentsAreaNav />
      <div className="page-header agents-toolbar">
        <h1>{t('skills.pageTitle')}</h1>
      </div>

      <section className="agent-skills-upload">
        <h2>{t('skills.uploadHeading')}</h2>
        <div className="agent-skills-upload-grid">
          <label>
            <span>{t('skills.skillId')}</span>
            <input value={skillId} onChange={(e) => setSkillId(e.target.value)} placeholder="openkms" />
          </label>
          <label>
            <span>{t('skills.version')}</span>
            <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.0.0" />
          </label>
          <label>
            <span>{t('skills.displayName')}</span>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </label>
          <label className="agent-skills-upload-notes">
            <span>{t('skills.notes')}</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </div>
        <div className="agent-skills-upload-actions">
          <input
            ref={zipRef}
            type="file"
            accept=".zip,application/zip"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onUploadZip(f);
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
              if (e.target.files?.length) void onUploadFolder(e.target.files);
              e.target.value = '';
            }}
          />
          <button type="button" className="btn btn-secondary" disabled={uploading} onClick={() => zipRef.current?.click()}>
            {uploading ? <Loader2 size={16} className="spin" /> : <Upload size={16} />}
            {t('skills.uploadZip')}
          </button>
          <button type="button" className="btn btn-secondary" disabled={uploading} onClick={() => folderRef.current?.click()}>
            {uploading ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
            {t('skills.uploadFolder')}
          </button>
        </div>
      </section>

      {loading ? <AgentsListSkeleton /> : null}

      {!loading ? (
        <div className="agent-skills-list">
          {skills.length === 0 ? <p className="agent-skills-empty">{t('skills.empty')}</p> : null}
          {skills.map((skill) => (
            <article key={skill.id} className="agent-skills-card">
              <header className="agent-skills-card-header">
                <div>
                  <h3>{skill.display_name}</h3>
                  <p className="agent-skills-meta">
                    <code>{skill.id}</code>
                    {skill.created_by_name ? (
                      <span>
                        {t('skills.createdBy', { name: skill.created_by_name })}
                      </span>
                    ) : null}
                  </p>
                </div>
                <label className="agent-skills-default-toggle">
                  <input
                    type="checkbox"
                    checked={skill.is_default}
                    onChange={(e) => void toggleDefault(skill, e.target.checked)}
                  />
                  <span>{t('skills.defaultForNewProjects')}</span>
                </label>
              </header>
              {skill.is_default ? (
                <div className="agent-skills-default-version">
                  <label>
                    <span>{t('skills.defaultVersion')}</span>
                    <select
                      value={skill.default_version ?? ''}
                      onChange={(e) => void setDefaultVersion(skill, e.target.value)}
                    >
                      <option value="">{t('skills.latestVersion')}</option>
                      {skill.versions.map((v) => (
                        <option key={v.id} value={v.version}>
                          {v.version}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}
              <table className="agent-skills-versions">
                <thead>
                  <tr>
                    <th>{t('skills.version')}</th>
                    <th>{t('skills.uploadedBy')}</th>
                    <th>{t('skills.hash')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {skill.versions.map((v) => (
                    <tr key={v.id}>
                      <td>
                        <code>{v.version}</code>
                      </td>
                      <td>{v.uploaded_by_name ?? '—'}</td>
                      <td>
                        <code title={v.content_hash}>{shortHash(v.content_hash)}</code>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="agent-skills-delete"
                          aria-label={t('skills.deleteVersion')}
                          onClick={() => void onDeleteVersion(skill.id, v.version)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
