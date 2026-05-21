import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Languages, Settings } from 'lucide-react';
import {
  createApiKey,
  fetchApiKeys,
  revokeApiKey,
  type ApiKeyCreated,
  type ApiKeyListItem,
} from '../data/userApiKeysApi';
import { patchAuthUiLocale } from '../data/authApi';
import { useAuth } from '../contexts/AuthContext';
import i18n from '../i18n/config';
import '../components/LanguageSwitcher.scss';
import './UserSettings.scss';

export function UserSettings() {
  const { t } = useTranslation('settings');
  const { t: tLayout } = useTranslation('layout');
  const { isAuthenticated, refreshUser } = useAuth();
  const [keys, setKeys] = useState<ApiKeyListItem[]>([]);
  const [keysLoading, setKeysLoading] = useState(true);
  const [keysError, setKeysError] = useState<string | null>(null);
  const [newKeyName, setNewKeyName] = useState('');
  const [creating, setCreating] = useState(false);
  const [justCreated, setJustCreated] = useState<ApiKeyCreated | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [localeSaving, setLocaleSaving] = useState(false);
  const [localeError, setLocaleError] = useState<string | null>(null);

  const currentUiLocale = i18n.language?.startsWith('zh') ? 'zh-CN' : 'en';

  const handleLocaleChange = async (lng: string) => {
    if (lng !== 'en' && lng !== 'zh-CN') return;
    setLocaleSaving(true);
    setLocaleError(null);
    try {
      await patchAuthUiLocale(lng);
      await refreshUser();
    } catch (e) {
      setLocaleError(e instanceof Error ? e.message : t('errors.localeSave'));
    } finally {
      setLocaleSaving(false);
    }
  };

  const loadKeys = useCallback(async () => {
    setKeysLoading(true);
    setKeysError(null);
    try {
      const list = await fetchApiKeys(false);
      setKeys(list);
    } catch (e) {
      setKeys([]);
      setKeysError(e instanceof Error ? e.message : t('errors.loadKeys'));
    } finally {
      setKeysLoading(false);
    }
  }, [t]);

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
      setKeysError(e instanceof Error ? e.message : t('errors.createKey'));
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!window.confirm(t('confirmRevoke'))) return;
    setRevokingId(id);
    setKeysError(null);
    try {
      await revokeApiKey(id);
      await loadKeys();
    } catch (e) {
      setKeysError(e instanceof Error ? e.message : t('errors.revokeKey'));
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="user-settings-page">
      <div className="page-header">
        <h1 className="user-settings-page-title">
          <Settings size={28} strokeWidth={1.75} aria-hidden />
          {t('pageTitle')}
        </h1>
        <p className="page-subtitle">{t('pageSubtitle')}</p>
      </div>

      <div className="user-settings-card user-settings-card--locale">
        <h2 className="user-settings-section-title">{t('interfaceLanguageTitle')}</h2>
        <p className="page-subtitle user-settings-section-intro">{t('interfaceLanguageIntro')}</p>
        {!isAuthenticated ? (
          <p className="page-subtitle">{t('interfaceLanguageSignInHint')}</p>
        ) : (
          <>
            <div className="language-switcher user-settings-locale-row">
              <Languages size={18} strokeWidth={1.75} className="language-switcher-icon" aria-hidden />
              <label htmlFor="settings-locale-select" className="sr-only">
                {tLayout('language')}
              </label>
              <select
                id="settings-locale-select"
                className="language-switcher-select"
                value={currentUiLocale}
                disabled={localeSaving}
                onChange={(e) => void handleLocaleChange(e.target.value)}
                aria-label={tLayout('language')}
              >
                <option value="en">{tLayout('languageEnglish')}</option>
                <option value="zh-CN">{tLayout('languageChinese')}</option>
              </select>
              {localeSaving && <span className="user-settings-locale-saving">{t('localeSaving')}</span>}
            </div>
            {localeError && <p className="user-settings-error">{localeError}</p>}
          </>
        )}
      </div>

      <div className="user-settings-card">
        <h2 className="user-settings-api-keys-title">{t('apiKeysTitle')}</h2>
        <p className="page-subtitle user-settings-api-keys-intro">{t('apiKeysIntro')}</p>

        {justCreated && (
          <div className="user-settings-api-key-reveal" role="status">
            <p className="user-settings-api-key-reveal-title">{t('keyCreatedTitle')}</p>
            <p className="user-settings-api-key-reveal-hint">{t('keyCreatedHint')}</p>
            <div className="user-settings-api-key-token-row">
              <code className="user-settings-api-key-token">{justCreated.token}</code>
              <button
                type="button"
                className="user-settings-btn user-settings-btn--secondary"
                onClick={() => void navigator.clipboard.writeText(justCreated.token)}
              >
                {t('copy')}
              </button>
            </div>
            <button type="button" className="user-settings-btn user-settings-btn--primary" onClick={() => setJustCreated(null)}>
              {t('done')}
            </button>
          </div>
        )}

        {!justCreated && (
          <div className="user-settings-api-key-create">
            <label className="user-settings-api-key-label" htmlFor="new-api-key-name">
              {t('labelOptional')}
            </label>
            <div className="user-settings-api-key-create-row">
              <input
                id="new-api-key-name"
                type="text"
                className="user-settings-api-key-input"
                placeholder={t('placeholderLabel')}
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
                {creating ? t('creating') : t('createKey')}
              </button>
            </div>
          </div>
        )}

        {keysError && <p className="user-settings-error">{keysError}</p>}

        {keysLoading && <p className="page-subtitle">{t('loadingKeys')}</p>}

        {!keysLoading && keys.length === 0 && !justCreated && <p className="page-subtitle">{t('noKeys')}</p>}

        {!keysLoading && keys.length > 0 && (
          <ul className="user-settings-api-key-list">
            {keys.map((k) => (
              <li key={k.id} className="user-settings-api-key-item">
                <div>
                  <span className="user-settings-api-key-name">{k.name || t('unnamed')}</span>
                  <span className="user-settings-api-key-prefix">{k.key_prefix}…</span>
                </div>
                <div className="user-settings-api-key-meta">
                  {k.last_used_at
                    ? t('lastUsed', { when: new Date(k.last_used_at).toLocaleString() })
                    : t('neverUsed')}
                </div>
                <button
                  type="button"
                  className="user-settings-btn user-settings-btn--danger"
                  disabled={revokingId === k.id}
                  onClick={() => void handleRevoke(k.id)}
                >
                  {revokingId === k.id ? t('revoking') : t('revoke')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
