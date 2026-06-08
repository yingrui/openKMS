import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, Puzzle, Settings, Trash2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { AgentsAreaNav } from '../../components/agents/AgentsAreaNav';
import { AgentsListSkeleton } from '../../components/agents/AgentsPageSkeleton';
import {
  deleteAgentSkill,
  listAgentSkills,
  uploadAgentSkillFolder,
  uploadAgentSkillZip,
  type AgentSkill,
} from '../../data/agentSkillsApi';
import './ProjectList.scss';
import './AgentSkillsPage.scss';

export function AgentSkillsPage() {
  const { t } = useTranslation('agents');
  const { t: ts } = useTranslation('explore');
  const [skills, setSkills] = useState<AgentSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [skillId, setSkillId] = useState('');
  const [version, setVersion] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [notes, setNotes] = useState('');
  const zipRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const emptySkillIdRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (!loading && skills.length === 0) {
      emptySkillIdRef.current?.focus();
    }
  }, [loading, skills.length]);

  const resetUploadForm = () => {
    setSkillId('');
    setVersion('');
    setDisplayName('');
    setNotes('');
    setShowUpload(false);
  };

  const canUpload = skillId.trim() && version.trim();

  const handleDeleteSkill = async (skill: AgentSkill, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(t('skills.deleteSkillConfirm', { name: skill.display_name, skillId: skill.id }))) return;
    try {
      await deleteAgentSkill(skill.id);
      toast.success(t('skills.deleteSkillSuccess'));
      setSkills((prev) => prev.filter((s) => s.id !== skill.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('skills.deleteSkillError'));
    }
  };

  const runUpload = async (mode: 'zip' | 'folder', file?: File, fileList?: FileList) => {
    if (!canUpload) {
      toast.error(t('skills.uploadFieldsRequired'));
      return;
    }
    setUploading(true);
    try {
      if (mode === 'zip' && file) {
        await uploadAgentSkillZip({
          skillId: skillId.trim(),
          version: version.trim(),
          displayName: displayName.trim() || undefined,
          notes: notes.trim() || undefined,
          file,
        });
      } else if (mode === 'folder' && fileList?.length) {
        const files = Array.from(fileList);
        const relativePaths = files.map((f) => {
          const w = (f as File & { webkitRelativePath?: string }).webkitRelativePath;
          return w || f.name;
        });
        await uploadAgentSkillFolder({
          skillId: skillId.trim(),
          version: version.trim(),
          displayName: displayName.trim() || undefined,
          notes: notes.trim() || undefined,
          files,
          relativePaths,
        });
      } else {
        return;
      }
      toast.success(t('skills.uploadSuccess'));
      setVersion('');
      setNotes('');
      resetUploadForm();
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('skills.uploadError'));
    } finally {
      setUploading(false);
    }
  };

  const hasSkills = !loading && skills.length > 0;
  const isEmpty = !loading && skills.length === 0;

  const uploadFields = (
    <>
      <label>
        <span>{t('skills.skillId')}</span>
        <input
          value={skillId}
          onChange={(e) => setSkillId(e.target.value)}
          placeholder="my-skill"
          autoComplete="off"
        />
      </label>
      <label>
        <span>{t('skills.version')}</span>
        <input
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          placeholder="1.0.0"
          autoComplete="off"
        />
      </label>
      <label>
        <span>{t('skills.displayName')}</span>
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="off" />
      </label>
      <label>
        <span>{t('skills.notes')}</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </label>
    </>
  );

  const uploadActions = (fullWidth = false) => (
    <div className={`agent-skills-upload-actions${fullWidth ? ' agent-skills-upload-actions--stacked' : ''}`}>
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
        className={`btn ${fullWidth ? 'btn-primary' : 'btn-secondary'}`}
        disabled={uploading || !canUpload}
        onClick={() => zipRef.current?.click()}
      >
        {uploading ? <Loader2 size={18} className="agent-skills-spin" /> : <Upload size={18} />}
        {t('skills.uploadZip')}
      </button>
      <button
        type="button"
        className="btn btn-secondary"
        disabled={uploading || !canUpload}
        onClick={() => folderRef.current?.click()}
      >
        {uploading ? <Loader2 size={18} className="agent-skills-spin" /> : <Plus size={18} />}
        {t('skills.uploadFolder')}
      </button>
    </div>
  );

  return (
    <div className={`agents-list page${isEmpty ? ' agents-list--empty' : ''}`}>
      <AgentsAreaNav />

      {hasSkills ? (
        <div className="page-header agents-toolbar">
          <h1>{t('skills.pageTitle')}</h1>
          <div className="agents-toolbar-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                resetUploadForm();
                setShowUpload(true);
              }}
            >
              <Plus size={18} />
              <span>{t('skills.upload')}</span>
            </button>
          </div>
        </div>
      ) : null}

      {loading ? <AgentsListSkeleton /> : null}

      {isEmpty ? (
        <div className="agents-empty">
          <div className="agents-empty-hero">
            <div className="agents-empty-icon" aria-hidden>
              <Puzzle size={36} strokeWidth={1.5} />
            </div>
            <h2>{t('skills.emptyTitle')}</h2>
            <p className="agents-empty-lead">{t('skills.emptyLead')}</p>
          </div>
          <div className="agents-empty-card agent-skills-empty-card">
            <label>
              <span>{t('skills.skillId')}</span>
              <input
                ref={emptySkillIdRef}
                value={skillId}
                onChange={(e) => setSkillId(e.target.value)}
                placeholder="my-skill"
                autoComplete="off"
              />
            </label>
            <label>
              <span>{t('skills.version')}</span>
              <input
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="1.0.0"
                autoComplete="off"
              />
            </label>
            {uploadActions(true)}
          </div>
        </div>
      ) : null}

      {hasSkills ? (
        <div className="agents-grid">
          {skills.map((skill) => (
            <div key={skill.id} className="agents-card">
              <div className="agents-card-top">
                <Link to={`/agents/skills/${skill.id}/settings`} className="agents-card-icon" aria-hidden>
                  <Puzzle size={26} strokeWidth={1.5} />
                </Link>
                <div className="agents-card-actions">
                  <Link
                    to={`/agents/skills/${skill.id}/settings`}
                    title={t('skills.settings.title')}
                    aria-label={t('skills.settings.title')}
                  >
                    <Settings size={15} />
                  </Link>
                  <button
                    type="button"
                    className="agent-skills-card-delete"
                    title={t('skills.settings.deleteSkill')}
                    aria-label={t('skills.settings.deleteSkill')}
                    onClick={(e) => void handleDeleteSkill(skill, e)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              <Link to={`/agents/skills/${skill.id}/settings`} className="agents-card-body">
                <h3>{skill.display_name}</h3>
                <p className="agents-card-desc">
                  <code>{skill.id}</code>
                </p>
                <span className="agents-card-meta">
                  {t('skills.versionCount', { count: skill.versions.length })}
                  {skill.is_default ? ` · ${t('skills.defaultForNewProjects')}` : ''}
                  {skill.created_by_name ? ` · ${t('skills.createdBy', { name: skill.created_by_name })}` : ''}
                </span>
              </Link>
            </div>
          ))}
        </div>
      ) : null}

      {showUpload ? (
        <div className="agents-dialog-overlay" onClick={resetUploadForm} role="presentation">
          <div
            className="agents-dialog agent-skills-dialog"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal
            aria-labelledby="agent-skills-upload-title"
          >
            <div className="agents-dialog-header">
              <h2 id="agent-skills-upload-title">{t('skills.dialogUpload')}</h2>
              <button type="button" className="agents-dialog-close" aria-label={ts('shared.close')} onClick={resetUploadForm}>
                <X size={20} />
              </button>
            </div>
            <div className="agents-dialog-body">
              {uploadFields}
              {uploadActions()}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
