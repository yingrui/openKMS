import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings } from 'lucide-react';
import {
  createApiKey,
  fetchApiKeys,
  revokeApiKey,
  type ApiKeyCreated,
  type ApiKeyListItem,
} from '../data/userApiKeysApi';
import './UserSettings.css';

export function UserSettings() {
  const [keys, setKeys] = useState<ApiKeyListItem[]>([]);
  const [keysLoading, setKeysLoading] = useState(true);
  const [keysError, setKeysError] = useState<string | null>(null);
  const [newKeyName, setNewKeyName] = useState('');
  const [creating, setCreating] = useState(false);
  const [justCreated, setJustCreated] = useState<ApiKeyCreated | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const loadKeys = useCallback(async () => {
    setKeysLoading(true);
    setKeysError(null);
    try {
      const list = await fetchApiKeys(false);
      setKeys(list);
    } catch (e) {
      setKeys([]);
      setKeysError(e instanceof Error ? e.message : 'Could not load API keys');
    } finally {
      setKeysLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  const handleCreate = async () => {
    setCreating(true);
    setKeysError(null);
    try {
      const created = await createApiKey(newKeyName);
      setJustCreated(created);
      setNewKeyName('');
      await loadKeys();
    } catch (e) {
      setKeysError(e instanceof Error ? e.message : 'Could not create key');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!window.confirm('Revoke this key? Apps using it will stop working.')) return;
    setRevokingId(id);
    setKeysError(null);
    try {
      await revokeApiKey(id);
      await loadKeys();
    } catch (e) {
      setKeysError(e instanceof Error ? e.message : 'Could not revoke key');
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="user-settings-page">
      <div className="page-header">
        <h1 className="user-settings-page-title">
          <Settings size={28} strokeWidth={1.75} aria-hidden />
          Settings
        </h1>
        <p className="page-subtitle">
          API keys and integration access.
        </p>
      </div>

      <div className="user-settings-card">
        <h2 className="user-settings-api-keys-title">API keys</h2>
        <p className="page-subtitle user-settings-api-keys-intro">
          Create keys for assistants and scripts that call openKMS on your behalf.
        </p>

        {justCreated && (
          <div className="user-settings-api-key-reveal" role="status">
            <p className="user-settings-api-key-reveal-title">Key created — copy it now</p>
            <p className="user-settings-api-key-reveal-hint">
              This value is shown only once. If you lose it, revoke the key and create a new one.
            </p>
            <div className="user-settings-api-key-token-row">
              <code className="user-settings-api-key-token">{justCreated.token}</code>
              <button
                type="button"
                className="user-settings-btn user-settings-btn--secondary"
                onClick={() => void navigator.clipboard.writeText(justCreated.token)}
              >
                Copy
              </button>
            </div>
            <button type="button" className="user-settings-btn user-settings-btn--primary" onClick={() => setJustCreated(null)}>
              Done
            </button>
          </div>
        )}

        {!justCreated && (
          <div className="user-settings-api-key-create">
            <label className="user-settings-api-key-label" htmlFor="new-api-key-name">
              Label (optional)
            </label>
            <div className="user-settings-api-key-create-row">
              <input
                id="new-api-key-name"
                type="text"
                className="user-settings-api-key-input"
                placeholder="e.g. laptop assistant"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                maxLength={128}
              />
              <button
                type="button"
                className="user-settings-btn user-settings-btn--primary"
                disabled={creating}
                onClick={() => void handleCreate()}
              >
                {creating ? 'Creating…' : 'Create key'}
              </button>
            </div>
          </div>
        )}

        {keysError && <p className="user-settings-error">{keysError}</p>}

        {keysLoading && <p className="page-subtitle">Loading keys…</p>}

        {!keysLoading && keys.length === 0 && !justCreated && <p className="page-subtitle">No active keys yet.</p>}

        {!keysLoading && keys.length > 0 && (
          <ul className="user-settings-api-key-list">
            {keys.map((k) => (
              <li key={k.id} className="user-settings-api-key-item">
                <div>
                  <span className="user-settings-api-key-name">{k.name || 'Unnamed'}</span>
                  <span className="user-settings-api-key-prefix">{k.key_prefix}…</span>
                </div>
                <div className="user-settings-api-key-meta">
                  {k.last_used_at ? `Last used ${new Date(k.last_used_at).toLocaleString()}` : 'Never used'}
                </div>
                <button
                  type="button"
                  className="user-settings-btn user-settings-btn--danger"
                  disabled={revokingId === k.id}
                  onClick={() => void handleRevoke(k.id)}
                >
                  {revokingId === k.id ? 'Revoking…' : 'Revoke'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
