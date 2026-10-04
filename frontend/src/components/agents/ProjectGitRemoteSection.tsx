import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  gitPull,
  gitPush,
  gitSetRemote,
  gitStatus,
  listGitCredentials,
  type ProjectResponse,
  type UserGitCredential,
} from '../../data/projectsApi';
import { FormField } from '../../styles/design-system';

function gitSettings(project: ProjectResponse): { remote_url?: string; credential_id?: string } {
  const raw = project.settings?.git;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const git = raw as Record<string, unknown>;
  return {
    remote_url: typeof git.remote_url === 'string' ? git.remote_url : undefined,
    credential_id: typeof git.credential_id === 'string' ? git.credential_id : undefined,
  };
}

export function ProjectGitRemoteSection({
  project,
  onProjectChange,
}: {
  project: ProjectResponse;
  onProjectChange: (project: ProjectResponse) => void;
}) {
  const { t } = useTranslation('agents');
  const stored = gitSettings(project);
  const [url, setUrl] = useState(stored.remote_url ?? '');
  const [credentialId, setCredentialId] = useState(stored.credential_id ?? '');
  const [branch, setBranch] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<UserGitCredential[]>([]);
  const [busy, setBusy] = useState<'save' | 'pull' | 'push' | null>(null);

  const loadStatus = async (fallbackUrl: string) => {
    try {
      const st = await gitStatus(project.id);
      setBranch(st.branch);
      setUrl(st.remote_url || fallbackUrl);
    } catch {
      setUrl(fallbackUrl);
    }
  };

  useEffect(() => {
    const next = gitSettings(project);
    setCredentialId(next.credential_id ?? '');
    void loadStatus(next.remote_url ?? '');
    void listGitCredentials()
      .then(setCredentials)
      .catch((e) => toast.error(String(e)));
  }, [project.id]);

  const requireHttps = (value: string) => {
    if (!value.startsWith('https://')) {
      toast.error(t('list.gitHttpsOnly'));
      return false;
    }
    return true;
  };

  const saveRemote = async () => {
    const trimmed = url.trim();
    if (!trimmed || !requireHttps(trimmed)) return;
    setBusy('save');
    try {
      await gitSetRemote(project.id, trimmed, credentialId || undefined);
      const prevGit =
        typeof project.settings?.git === 'object' && project.settings.git && !Array.isArray(project.settings.git)
          ? { ...(project.settings.git as Record<string, unknown>) }
          : {};
      const nextGit: Record<string, unknown> = { ...prevGit, remote_url: trimmed };
      if (credentialId) nextGit.credential_id = credentialId;
      else delete nextGit.credential_id;
      onProjectChange({
        ...project,
        git_initialized: true,
        settings: { ...project.settings, git: nextGit },
      });
      await loadStatus(trimmed);
      toast.success(t('settings.git.saved'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('settings.git.saveError'));
    } finally {
      setBusy(null);
    }
  };

  const runRemote = async (kind: 'pull' | 'push') => {
    if (!credentialId) {
      toast.error(t('settings.git.credentialRequired'));
      return;
    }
    setBusy(kind);
    try {
      if (kind === 'pull') await gitPull(project.id, credentialId);
      else await gitPush(project.id, credentialId);
      await loadStatus(url.trim());
      toast.success(kind === 'pull' ? t('settings.git.pulled') : t('settings.git.pushed'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('settings.git.remoteError'));
    } finally {
      setBusy(null);
    }
  };

  const urlHint = branch
    ? `${t('settings.git.urlHint')} ${t('settings.git.currentBranch', { branch })}`
    : t('settings.git.urlHint');

  return (
    <section className="project-settings-section">
      <h2>{t('settings.git.heading')}</h2>
      <p className="project-settings-hint project-settings-hint--intro">{t('settings.git.hint')}</p>
      <FormField label={t('settings.git.url')} hint={urlHint}>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t('list.gitUrlPlaceholder')}
          disabled={busy !== null}
          autoComplete="off"
        />
      </FormField>
      <FormField
        label={t('settings.git.credential')}
        hint={
          <>
            {t('settings.git.credentialHint')}{' '}
            <Link to="/settings#agent-git-credentials">{t('settings.git.manageCredentials')}</Link>
          </>
        }
      >
        <select
          value={credentialId}
          onChange={(e) => setCredentialId(e.target.value)}
          disabled={busy !== null}
        >
          <option value="">{t('settings.git.credentialNone')}</option>
          {credentials.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label} ({c.username})
            </option>
          ))}
        </select>
      </FormField>
      <div className="project-settings-git-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy !== null || !url.trim()}
          onClick={() => void saveRemote()}
        >
          {busy === 'save' ? <Loader2 size={16} className="project-settings-spinner" /> : null}
          {t('settings.git.saveRemote')}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy !== null || !url.trim()}
          onClick={() => void runRemote('pull')}
        >
          {busy === 'pull' ? <Loader2 size={16} className="project-settings-spinner" /> : null}
          {t('settings.git.pull')}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy !== null || !url.trim()}
          onClick={() => void runRemote('push')}
        >
          {busy === 'push' ? <Loader2 size={16} className="project-settings-spinner" /> : null}
          {t('settings.git.push')}
        </button>
      </div>
    </section>
  );
}
