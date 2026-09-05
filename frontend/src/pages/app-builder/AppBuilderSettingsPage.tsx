import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useConfirm } from '../../contexts/ConfirmContext';
import {
  fetchAppDesign,
  listAppVersions,
  rollbackApp,
  updateApp,
  type AppBuilderAppResponse,
  type AppBuilderVersion,
} from '../../data/appBuilderApi';
import { FormField } from '../../styles/design-system';
import './AppBuilderPages.scss';

export function AppBuilderSettingsPage() {
  const { appId = '' } = useParams();
  const { t } = useTranslation('appBuilder');
  const confirm = useConfirm();
  const [app, setApp] = useState<AppBuilderAppResponse | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [versions, setVersions] = useState<AppBuilderVersion[]>([]);
  const [tab, setTab] = useState<'general' | 'versions'>('general');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const design = await fetchAppDesign(appId);
    setApp(design);
    setName(design.name);
    setDescription(design.description ?? '');
    const vs = await listAppVersions(appId);
    setVersions(vs);
  }, [appId]);

  useEffect(() => {
    void reload().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [reload]);

  const save = () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    void updateApp(appId, { name: name.trim() || undefined, description: description.trim() || null })
      .then(() => setSaved(true))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setSaving(false));
  };

  const doRollback = async (versionId: string) => {
    const ok = await confirm({
      title: t('rollback'),
      message: t('rollbackConfirm'),
      confirmLabel: t('rollback'),
      cancelLabel: t('cancel'),
      danger: true,
    });
    if (!ok) return;
    try {
      await rollbackApp(appId, versionId);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (!app) return <div className="app-builder-page">{t('loading')}</div>;

  return (
    <div className="app-builder-page">
      <header className="page-header app-builder-page__header">
        <div>
          <h1>{app.name}</h1>
          <p className="page-subtitle">{t('settingsTitle')}</p>
        </div>
        <Link to={`/app-builder/${appId}/design`} className="btn btn-secondary">
          {t('backToDesign')}
        </Link>
      </header>

      <div className="app-builder-settings-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'general'}
          className={`app-builder-settings-tab${tab === 'general' ? ' is-active' : ''}`}
          onClick={() => setTab('general')}
        >
          {t('tabGeneral')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'versions'}
          className={`app-builder-settings-tab${tab === 'versions' ? ' is-active' : ''}`}
          onClick={() => setTab('versions')}
        >
          {t('tabVersions')}
        </button>
      </div>

      {tab === 'general' ? (
        <div className="app-builder-settings-form">
          <FormField label={t('name')}>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField label={t('description')}>
            <textarea value={description} rows={3} onChange={(e) => setDescription(e.target.value)} />
          </FormField>
          {error ? <p className="app-builder-page__error" role="alert">{error}</p> : null}
          {saved ? <p className="app-builder-page__muted">{t('saved')}</p> : null}
          <div className="app-builder-page__actions">
            <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
              {t('save')}
            </button>
          </div>
        </div>
      ) : (
        <div className="app-builder-settings-versions">
          {versions.length === 0 ? (
            <p className="app-builder-page__muted">{t('versionsEmpty')}</p>
          ) : (
            <ul className="app-builder-page__list">
              {versions.map((v) => (
                <li key={v.id} className="app-builder-page__row">
                  <div>
                    <strong>v{v.version}</strong>
                    {v.is_current ? (
                      <span className="app-builder-page__badge">{t('currentVersion')}</span>
                    ) : null}
                    <div className="app-builder-page__meta">
                      {v.created_by_name ? `${v.created_by_name} · ` : ''}
                      {new Date(v.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="app-builder-page__actions">
                    {!v.is_current ? (
                      <button type="button" className="btn btn-secondary" onClick={() => void doRollback(v.id)}>
                        {t('rollback')}
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {error ? <p className="app-builder-page__error" role="alert">{error}</p> : null}
        </div>
      )}
    </div>
  );
}
