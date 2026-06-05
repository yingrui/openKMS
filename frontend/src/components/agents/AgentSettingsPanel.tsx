import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { patchProjectSettings } from '../../data/projectsApi';

interface Props {
  projectId: string;
  settings: Record<string, unknown>;
  onClose: () => void;
  onSaved: (settings: Record<string, unknown>) => void;
}

export function AgentSettingsPanel({ projectId, settings, onClose, onSaved }: Props) {
  const { t } = useTranslation('agents');
  const [json, setJson] = useState(JSON.stringify(settings, null, 2));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const parsed = JSON.parse(json) as Record<string, unknown>;
      const out = await patchProjectSettings(projectId, parsed);
      onSaved(out);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid JSON');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--color-bg-elevated)',
          borderRadius: 'var(--radius-lg)',
          padding: 20,
          width: 'min(560px, 92vw)',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: 0 }}>{t('settings.title')}</h2>
        <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>{t('settings.hint')}</p>
        <textarea
          value={json}
          onChange={(e) => setJson(e.target.value)}
          rows={16}
          style={{ fontFamily: 'monospace', fontSize: '0.8125rem', flex: 1 }}
        />
        {error ? <p style={{ color: 'var(--color-danger)' }}>{error}</p> : null}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>
            {t('settings.cancel')}
          </button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={save}>
            {t('settings.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
