import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Settings } from 'lucide-react';
import { toast } from 'sonner';
import {
  DEFAULT_SYSTEM_DISPLAY_NAME,
  fetchSystemSettings,
  updateSystemSettings,
  type SystemSettingsResponse,
} from '../../data/systemApi';
import { notifySystemSettingsUpdated } from '../../utils/systemSettingsStorage';
import './ConsoleSettings.css';

type FormState = {
  systemName: string;
  timezone: string;
  apiBaseUrl: string;
};

function fromServer(s: SystemSettingsResponse): FormState {
  return {
    systemName: (s.system_name ?? '').trim(),
    timezone: s.default_timezone,
    apiBaseUrl: s.api_base_url_note ?? '',
  };
}

export function ConsoleSettings() {
  const { t } = useTranslation('console');
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await fetchSystemSettings();
      setForm(fromServer(s));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('loadFailedToast'));
      setForm(null);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = useCallback(async () => {
    if (!form) return;
    setSaving(true);
    try {
      const updated = await updateSystemSettings({
        system_name: form.systemName.trim() || DEFAULT_SYSTEM_DISPLAY_NAME,
        default_timezone: form.timezone,
        api_base_url_note: form.apiBaseUrl.trim() ? form.apiBaseUrl.trim() : null,
      });
      setForm(fromServer(updated));
      notifySystemSettingsUpdated();
      toast.success(t('savedToast'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('saveFailedToast'));
    } finally {
      setSaving(false);
    }
  }, [form, t]);

  const handleReset = useCallback(() => {
    setForm((f) =>
      f
        ? {
            systemName: DEFAULT_SYSTEM_DISPLAY_NAME,
            timezone: 'UTC',
            apiBaseUrl: '',
          }
        : null
    );
    toast.info(t('resetInfoToast'));
  }, [t]);

  if (loading) {
    return (
      <div className="console-settings console-settings--loading">
        <Loader2 className="console-settings-loader" size={28} aria-hidden />
        <p className="console-settings-hint">{t('loading')}</p>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="console-settings">
        <div className="page-header">
          <h1>{t('pageTitle')}</h1>
          <p className="page-subtitle">{t('loadErrorSubtitle')}</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => void load()}>
          {t('retry')}
        </button>
      </div>
    );
  }

  return (
    <div className="console-settings">
      <div className="page-header">
        <h1>{t('pageTitle')}</h1>
        <p className="page-subtitle">{t('intro')}</p>
      </div>
      <div className="console-settings-card">
        <h2>
          <Settings size={20} />
          {t('general')}
        </h2>
        <div className="console-settings-section">
          <label htmlFor="console-settings-system-name">{t('systemName')}</label>
          <input
            id="console-settings-system-name"
            type="text"
            className="console-settings-input"
            value={form.systemName}
            onChange={(e) => setForm((f) => (f ? { ...f, systemName: e.target.value } : null))}
            autoComplete="organization"
          />
        </div>
        <div className="console-settings-section">
          <label htmlFor="console-settings-timezone">{t('defaultTimezone')}</label>
          <select
            id="console-settings-timezone"
            className="console-settings-select"
            value={form.timezone}
            onChange={(e) => setForm((f) => (f ? { ...f, timezone: e.target.value } : null))}
          >
            <option value="UTC">UTC</option>
            <option value="Asia/Shanghai">Asia/Shanghai</option>
            <option value="America/New_York">America/New_York</option>
          </select>
        </div>
      </div>
      <div className="console-settings-card">
        <h2>{t('apiIntegrations')}</h2>
        <div className="console-settings-section">
          <label htmlFor="console-settings-api-url">{t('apiBaseUrlNote')}</label>
          <input
            id="console-settings-api-url"
            type="text"
            className="console-settings-input"
            placeholder={t('apiBasePlaceholder')}
            value={form.apiBaseUrl}
            onChange={(e) => setForm((f) => (f ? { ...f, apiBaseUrl: e.target.value } : null))}
          />
          <p className="console-settings-hint">{t('apiBaseHint')}</p>
        </div>
      </div>
      <div className="console-settings-actions">
        <button type="button" className="btn btn-primary" onClick={() => void handleSave()} disabled={saving}>
          {saving ? t('saving') : t('saveChanges')}
        </button>
        <button type="button" className="btn btn-secondary" onClick={handleReset} disabled={saving}>
          {t('resetForm')}
        </button>
      </div>
    </div>
  );
}
