import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  createGitCredential,
  deleteGitCredential,
  listGitCredentials,
  type UserGitCredential,
} from '../../data/projectsApi';

export function GitCredentialsSection() {
  const { t } = useTranslation('agents');
  const [rows, setRows] = useState<UserGitCredential[]>([]);
  const [provider, setProvider] = useState('github');
  const [label, setLabel] = useState('');
  const [username, setUsername] = useState('');
  const [token, setToken] = useState('');

  const load = () => listGitCredentials().then(setRows).catch((e) => toast.error(String(e)));

  useEffect(() => {
    load();
  }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || !username.trim() || !token.trim()) return;
    try {
      await createGitCredential({ provider, label: label.trim(), username: username.trim(), token });
      setLabel('');
      setToken('');
      await load();
    } catch (err) {
      toast.error(String(err));
    }
  };

  return (
    <section id="agent-git-credentials" className="profile-card" style={{ marginTop: 24 }}>
      <h2>{t('gitCredentials.title')}</h2>
      <p className="page-subtitle">{t('gitCredentials.subtitle')}</p>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {rows.map((r) => (
          <li key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <span>
              {r.label} ({r.provider}) — {r.username}
            </span>
            <button type="button" className="btn btn-sm" onClick={() => deleteGitCredential(r.id).then(load)}>
              {t('gitCredentials.delete')}
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} style={{ display: 'grid', gap: 8, maxWidth: 400, marginTop: 12 }}>
        <input className="input" placeholder={t('gitCredentials.provider')} value={provider} onChange={(e) => setProvider(e.target.value)} />
        <input className="input" placeholder={t('gitCredentials.label')} value={label} onChange={(e) => setLabel(e.target.value)} />
        <input className="input" placeholder={t('gitCredentials.username')} value={username} onChange={(e) => setUsername(e.target.value)} />
        <input className="input" type="password" placeholder={t('gitCredentials.token')} value={token} onChange={(e) => setToken(e.target.value)} />
        <button type="submit" className="btn btn-primary btn-sm">
          {t('gitCredentials.add')}
        </button>
      </form>
    </section>
  );
}
