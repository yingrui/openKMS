import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Copy, KeyRound, Languages, Loader2, Lock, Settings, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  createApiKey,
  fetchApiKeys,
  revokeApiKey,
  type ApiKeyCreated,
  type ApiKeyListItem,
} from '../data/userApiKeysApi';
import { patchAuthUiLocale, changePassword } from '../data/authApi';
import { useAuth } from '../contexts/AuthContext';
import { GitCredentialsSection } from '../components/agents/GitCredentialsSection';
import i18n from '../i18n/config';
import './UserSettings.scss';

export function UserSettings() {
  const { t } = useTranslation('settings');
  const { t: tLayout } = useTranslation('layout');
  const { isAuthenticated, refreshUser, authMode } = useAuth();
  const [keys, setKeys] = useState<ApiKeyListItem[]>([]);
  const [keysLoading, setKeysLoading] = useState(true);
  const [keysError, setKeysError] = useState<string | null>(null);
  const [newKeyName, setNewKeyName] = useState('');
  const [creating, setCreating] = useState(false);
  const [justCreated, setJustCreated] = useState<ApiKeyCreated | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [localeSaving, setLocaleSaving] = useState(false);
  const [localeError, setLocaleError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);

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

  const handleCopyToken = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token);
      toast.success(t('copied'));
    } catch {
      toast.error(t('errors.copy'));
    }
  };

  const showKeysListSection = keysLoading || keys.length > 0;

  const handleRevoke = async (id: string) => {
    if (!window.confirm(t('confirmRevoke'))) return;
    setRevokingId(id);
    setKeysError(null);
    try {
      await revokeApiKey(id);
      await loadKeys();
      toast.success(t('revoked'));
    } catch (e) {
      setKeysError(e instanceof Error ? e.message : t('errors.revokeKey'));
    } finally {
      setRevokingId(null);
    }
  };

  const handlePasswordChange = async () => {
    if (!currentPassword || !newPassword) return;
    setPasswordSaving(true);
    setPasswordError(null);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setShowPasswordDialog(false);
      toast.success(t('passwordChanged'));
    } catch (e) {
      setPasswordError(e instanceof Error ? e.message : t('errors.passwordChange'));
    } finally {
      setPasswordSaving(false);
    }
  };

  const openPasswordDialog = () => {
    setCurrentPassword('');
    setNewPassword('');
    setPasswordError(null);
    setShowPasswordDialog(true);
  };

  return (
    <div className="account-page">
      <header className="account-page-header">
        <h1 className="account-page-title">
          <Settings size={26} strokeWidth={1.75} aria-hidden />
          {t('pageTitle')}
        </h1>
        <p className="account-page-subtitle">{t('pageSubtitle')}</p>
      </header>

      <div className="account-stack">
        <section className="account-card" aria-labelledby="settings-locale-heading">
          <div className="account-card-head">
            <span className="account-card-icon" aria-hidden>
              <Languages size={18} strokeWidth={1.75} />
            </span>
            <div>
              <h2 id="settings-locale-heading" className="account-card-title">
                {t('interfaceLanguageTitle')}
              </h2>
              <p className="account-card-desc">{t('interfaceLanguageIntro')}</p>
            </div>
          </div>

          {!isAuthenticated ? (
            <p className="account-hint">{t('interfaceLanguageSignInHint')}</p>
          ) : (
            <div className="account-field">
              <label htmlFor="settings-locale-select" className="account-field-label">
                {tLayout('language')}
              </label>
              <div className="account-field-control">
                <select
                  id="settings-locale-select"
                  className="account-select"
                  value={currentUiLocale}
                  disabled={localeSaving}
                  onChange={(e) => void handleLocaleChange(e.target.value)}
                >
                  <option value="en">{tLayout('languageEnglish')}</option>
                  <option value="zh-CN">{tLayout('languageChinese')}</option>
                </select>
                {localeSaving && (
                  <span className="account-field-status">
                    <Loader2 size={14} className="account-spin" aria-hidden />
                    {t('localeSaving')}
                  </span>
                )}
              </div>
              {localeError && <p className="account-error">{localeError}</p>}
            </div>
          )}
        </section>

        {isAuthenticated && authMode === 'local' && (
          <section className="account-card" aria-labelledby="settings-password-heading">
            <div className="account-card-head">
              <span className="account-card-icon account-card-icon--muted" aria-hidden>
                <Lock size={18} strokeWidth={1.75} />
              </span>
              <div>
                <h2 id="settings-password-heading" className="account-card-title">
                  {t('passwordTitle')}
                </h2>
                <p className="account-card-desc">{t('passwordIntro')}</p>
              </div>
            </div>

            <div className="account-create-panel account-create-panel--last">
              <button
                type="button"
                className="account-btn account-btn--primary"
                onClick={openPasswordDialog}
              >
                {t('changePassword')}
              </button>
            </div>
          </section>
        )}

        {showPasswordDialog && (
          <div
            className="console-modal-overlay"
            role="presentation"
            onClick={(e) => e.target === e.currentTarget && !passwordSaving && setShowPasswordDialog(false)}
          >
            <div
              className="console-modal"
              role="dialog"
              aria-labelledby="settings-password-dialog-title"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="console-modal-header">
                <h2 id="settings-password-dialog-title">{t('passwordTitle')}</h2>
                <button
                  type="button"
                  onClick={() => !passwordSaving && setShowPasswordDialog(false)}
                  disabled={passwordSaving}
                  aria-label={t('close')}
                >
                  <X size={20} />
                </button>
              </div>
              <div className="console-modal-body">
                <div className="account-form-grid account-form-grid--2col">
                  <div className="account-field">
                    <label className="account-field-label" htmlFor="settings-current-password">
                      {t('currentPassword')}
                    </label>
                    <input
                      id="settings-current-password"
                      className="account-input"
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      autoComplete="current-password"
                    />
                  </div>
                  <div className="account-field">
                    <label className="account-field-label" htmlFor="settings-new-password">
                      {t('newPassword')}
                    </label>
                    <input
                      id="settings-new-password"
                      className="account-input"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      autoComplete="new-password"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !passwordSaving) void handlePasswordChange();
                      }}
                    />
                  </div>
                </div>
                {passwordError && <p className="account-error">{passwordError}</p>}
              </div>
              <div className="console-modal-actions">
                <button
                  type="button"
                  className="account-btn account-btn--secondary"
                  onClick={() => setShowPasswordDialog(false)}
                  disabled={passwordSaving}
                >
                  {t('cancel')}
                </button>
                <button
                  type="button"
                  className="account-btn account-btn--primary"
                  disabled={passwordSaving || !currentPassword || !newPassword}
                  onClick={() => void handlePasswordChange()}
                >
                  {passwordSaving ? (
                    <>
                      <Loader2 size={16} className="account-spin" aria-hidden />
                      {t('changingPassword')}
                    </>
                  ) : (
                    t('changePassword')
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        <section className="account-card" aria-labelledby="settings-api-keys-heading">
          <div className="account-card-head">
            <span className="account-card-icon account-card-icon--muted" aria-hidden>
              <KeyRound size={18} strokeWidth={1.75} />
            </span>
            <div>
              <h2 id="settings-api-keys-heading" className="account-card-title">
                {t('apiKeysTitle')}
              </h2>
              <p className="account-card-desc">{t('apiKeysIntro')}</p>
            </div>
          </div>

          {justCreated && (
            <div className="user-settings-reveal" role="status">
              <div className="user-settings-reveal-head">
                <AlertTriangle size={18} strokeWidth={2} aria-hidden />
                <div>
                  <p className="user-settings-reveal-title">{t('keyCreatedTitle')}</p>
                  <p className="user-settings-reveal-hint">{t('keyCreatedHint')}</p>
                </div>
              </div>
              <div className="user-settings-reveal-token-row">
                <code className="user-settings-reveal-token">{justCreated.token}</code>
                <button
                  type="button"
                  className="account-btn account-btn--secondary"
                  onClick={() => void handleCopyToken(justCreated.token)}
                >
                  <Copy size={15} aria-hidden />
                  {t('copy')}
                </button>
              </div>
              <button
                type="button"
                className="account-btn account-btn--primary"
                onClick={() => setJustCreated(null)}
              >
                {t('done')}
              </button>
            </div>
          )}

          {!justCreated && (
            <div
              className={`account-create-panel${showKeysListSection ? '' : ' account-create-panel--last'}`}
            >
              <label className="account-field-label" htmlFor="new-api-key-name">
                {t('labelOptional')}
              </label>
              <div className="account-create-row">
                <input
                  id="new-api-key-name"
                  type="text"
                  className="account-input"
                  placeholder={t('placeholderLabel')}
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  maxLength={128}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !creating) void handleCreate();
                  }}
                />
                <button
                  type="button"
                  className="account-btn account-btn--primary"
                  disabled={creating}
                  onClick={() => void handleCreate()}
                >
                  {creating ? (
                    <>
                      <Loader2 size={16} className="account-spin" aria-hidden />
                      {t('creating')}
                    </>
                  ) : (
                    t('createKey')
                  )}
                </button>
              </div>
            </div>
          )}

          {keysError && <p className="account-error">{keysError}</p>}

          {showKeysListSection && (
            <div className="account-section">
              <div className="account-section-toolbar">
                <h3 className="account-section-label">{t('activeKeys')}</h3>
                {!keysLoading && keys.length > 0 && (
                  <span className="account-section-meta">{t('keysCount', { count: keys.length })}</span>
                )}
              </div>

              {keysLoading && (
                <div className="account-loading" role="status">
                  <Loader2 size={22} className="account-spin" aria-hidden />
                  <span>{t('loadingKeys')}</span>
                </div>
              )}

              {!keysLoading && keys.length > 0 && (
                <ul className="account-list">
                  {keys.map((k) => (
                    <li key={k.id} className="account-list-item">
                      <div className="account-list-item-main">
                        <span className="account-list-item-title">{k.name || t('unnamed')}</span>
                        <code className="account-list-item-code">{k.key_prefix}…</code>
                      </div>
                      <p className="account-list-item-meta">
                        {k.last_used_at
                          ? t('lastUsed', { when: new Date(k.last_used_at).toLocaleString() })
                          : t('neverUsed')}
                      </p>
                      <button
                        type="button"
                        className="account-btn account-btn--danger account-list-item-action"
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
          )}
        </section>

        {isAuthenticated && <GitCredentialsSection />}
      </div>
    </div>
  );
}
