import { useCallback, useEffect, useState } from 'react';
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
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await fetchSystemSettings();
      setForm(fromServer(s));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load system settings');
      setForm(null);
    } finally {
      setLoading(false);
    }
  }, []);

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
      toast.success('Settings saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save settings');
    } finally {
      setSaving(false);
    }
  }, [form]);

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
    toast.info('Form reset to defaults (not saved yet)');
  }, []);

  if (loading) {
    return (
      <div className="console-settings console-settings--loading">
        <Loader2 className="console-settings-loader" size={28} aria-hidden />
        <p className="console-settings-hint">Loading settings…</p>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="console-settings">
        <div className="page-header">
          <h1>System Settings</h1>
          <p className="page-subtitle">Could not load settings. You may need the console:settings permission.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => void load()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="console-settings">
      <div className="page-header">
        <h1>System Settings</h1>
        <p className="page-subtitle">
          System name is stored on the server and exposed to everyone via <code>GET /api/public/system</code> (no
          login). Other fields require an authenticated admin with <strong>console:settings</strong>.
        </p>
      </div>
      <div className="console-settings-card">
        <h2>
          <Settings size={20} />
          General
        </h2>
        <div className="console-settings-section">
          <label htmlFor="console-settings-system-name">System name</label>
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
          <label htmlFor="console-settings-timezone">Default timezone</label>
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
        <h2>API &amp; Integrations</h2>
        <div className="console-settings-section">
          <label htmlFor="console-settings-api-url">API base URL (reference note)</label>
          <input
            id="console-settings-api-url"
            type="text"
            className="console-settings-input"
            placeholder="Optional note (not used for API calls)"
            value={form.apiBaseUrl}
            onChange={(e) => setForm((f) => (f ? { ...f, apiBaseUrl: e.target.value } : null))}
          />
          <p className="console-settings-hint">
            Free-text note stored with system settings. The SPA continues to use the build-time API URL for requests.
          </p>
        </div>
      </div>
      <div className="console-settings-actions">
        <button type="button" className="btn btn-primary" onClick={() => void handleSave()} disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={handleReset} disabled={saving}>
          Reset form to defaults
        </button>
      </div>
    </div>
  );
}
