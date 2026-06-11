import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GitBranch, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  createGitCredential,
  deleteGitCredential,
  listGitCredentials,
  type UserGitCredential,
} from '../../data/projectsApi';
import '../../styles/account-page.scss';

export function GitCredentialsSection() {
  const { t } = useTranslation('agents');
  const [rows, setRows] = useState<UserGitCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [provider, setProvider] = useState('github');
  const [label, setLabel] = useState('');
  const [username, setUsername] = useState('');
  const [token, setToken] = useState('');

  const load = () => {
    setLoading(true);
    return listGitCredentials()
      .then(setRows)
      .catch((e) => toast.error(String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    void load();
  }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || !username.trim() || !token.trim()) return;
    setSaving(true);
    try {
      await createGitCredential({ provider, label: label.trim(), username: username.trim(), token });
      setLabel('');
      setToken('');
      await load();
      toast.success(t('gitCredentials.added'));
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  };

  const showListSection = loading || rows.length > 0;

  return (
    <section id="agent-git-credentials" className="account-card" aria-labelledby="profile-git-heading">
      <div className="account-card-head">
        <span className="account-card-icon account-card-icon--muted" aria-hidden>
          <GitBranch size={18} strokeWidth={1.75} />
        </span>
        <div>
          <h2 id="profile-git-heading" className="account-card-title">
            {t('gitCredentials.title')}
          </h2>
          <p className="account-card-desc">{t('gitCredentials.subtitle')}</p>
        </div>
      </div>

      <form
        className={`account-create-panel${showListSection ? '' : ' account-create-panel--last'}`}
        onSubmit={(e) => void add(e)}
      >
        <div className="account-form-grid account-form-grid--2col">
          <div className="account-field">
            <label className="account-field-label" htmlFor="git-credential-provider">
              {t('gitCredentials.provider')}
            </label>
            <input
              id="git-credential-provider"
              className="account-input"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="account-field">
            <label className="account-field-label" htmlFor="git-credential-label">
              {t('gitCredentials.label')}
            </label>
            <input
              id="git-credential-label"
              className="account-input"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="account-field">
            <label className="account-field-label" htmlFor="git-credential-username">
              {t('gitCredentials.username')}
            </label>
            <input
              id="git-credential-username"
              className="account-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>
          <div className="account-field">
            <label className="account-field-label" htmlFor="git-credential-token">
              {t('gitCredentials.token')}
            </label>
            <input
              id="git-credential-token"
              className="account-input"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="new-password"
            />
          </div>
        </div>
        <div className="account-form-actions">
          <button type="submit" className="account-btn account-btn--primary" disabled={saving}>
            {saving ? (
              <>
                <Loader2 size={16} className="account-spin" aria-hidden />
                {t('gitCredentials.adding')}
              </>
            ) : (
              t('gitCredentials.add')
            )}
          </button>
        </div>
      </form>

      {showListSection && (
        <div className="account-section">
          <div className="account-section-toolbar">
            <h3 className="account-section-label">{t('gitCredentials.saved')}</h3>
            {!loading && rows.length > 0 && (
              <span className="account-section-meta">{t('gitCredentials.savedCount', { count: rows.length })}</span>
            )}
          </div>

          {loading && (
            <div className="account-loading" role="status">
              <Loader2 size={22} className="account-spin" aria-hidden />
            </div>
          )}

          {!loading && rows.length > 0 && (
            <ul className="account-list">
              {rows.map((r) => (
                <li key={r.id} className="account-list-item">
                  <div className="account-list-item-main">
                    <span className="account-list-item-title">{r.label}</span>
                    <code className="account-list-item-code">{r.provider}</code>
                  </div>
                  <p className="account-list-item-meta">{r.username}</p>
                  <button
                    type="button"
                    className="account-btn account-btn--danger account-list-item-action"
                    onClick={() => void deleteGitCredential(r.id).then(load)}
                  >
                    {t('gitCredentials.delete')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
