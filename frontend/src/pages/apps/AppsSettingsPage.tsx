import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Server, Settings } from 'lucide-react';
import { useConfirm } from '../../contexts/ConfirmContext';
import {
  deleteApp,
  listApps,
  updateApp,
  type AppBuilderAppResponse,
  type AppBuilderBindings,
} from '../../data/appBuilderApi';
import { ModuleServiceBindingEditor } from './ModuleServiceBindingEditor';
import '../../styles/settings-page.scss';

type SettingsTab = 'general' | 'service';

const TABS: SettingsTab[] = ['general', 'service'];

function parseTab(raw: string | null): SettingsTab {
  if (raw && (TABS as string[]).includes(raw)) return raw as SettingsTab;
  return 'general';
}

export function AppsSettingsPage() {
  const { appId = '' } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useTranslation('apps');
  const confirm = useConfirm();
  const [app, setApp] = useState<AppBuilderAppResponse | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [serviceSaving, setServiceSaving] = useState(false);
  const [serviceSavedFlash, setServiceSavedFlash] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tab = parseTab(searchParams.get('tab'));

  const setTab = useCallback(
    (next: SettingsTab) => {
      setSearchParams(next === 'general' ? {} : { tab: next }, { replace: true });
      setError(null);
      setSaved(false);
    },
    [setSearchParams],
  );

  useEffect(() => {
    const raw = searchParams.get('tab');
    if (raw && !(TABS as string[]).includes(raw)) {
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const reload = useCallback(async () => {
    const rows = await listApps();
    const row = rows.find((a) => a.id === appId);
    if (!row) throw new Error('App not found');
    setApp(row);
    setName(row.name);
    setDescription(row.description || '');
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

  const saveService = (k8s: NonNullable<AppBuilderBindings['k8s']>) => {
    setServiceSaving(true);
    setError(null);
    void updateApp(appId, { bindings: { k8s } })
      .then((updated) => {
        setApp((prev) =>
          prev
            ? {
                ...prev,
                bindings: updated.bindings,
                bindings_hash: updated.bindings_hash,
                bindings_stale: updated.bindings_stale,
                missing_bindings: updated.missing_bindings,
              }
            : prev,
        );
        setServiceSavedFlash(true);
        window.setTimeout(() => setServiceSavedFlash(false), 2000);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setServiceSaving(false));
  };

  const doDelete = async () => {
    const ok = await confirm({
      title: t('delete'),
      message: t('confirmDelete'),
      confirmLabel: t('delete'),
      cancelLabel: t('cancel'),
      danger: true,
    });
    if (!ok) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteApp(appId);
      navigate('/apps', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDeleting(false);
    }
  };

  if (!app) return <div className="settings-page">{t('loading')}</div>;

  const tabs: { id: SettingsTab; label: string; icon: typeof Settings }[] = [
    { id: 'general', label: t('tabGeneral'), icon: Settings },
    { id: 'service', label: t('tabService'), icon: Server },
  ];

  return (
    <div className="settings-page">
      <Link to="/apps" className="settings-page-back">
        <ArrowLeft size={18} />
        <span>{t('backToGallery')}</span>
      </Link>

      <div className="page-header">
        <h1>{t('settingsTitle')}</h1>
        <p className="page-subtitle">
          {app.name} · {t('kindModule')}
        </p>
      </div>

      <div className="settings-page-tabs" role="tablist" aria-label={t('settingsTitle')}>
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`settings-page-tab${tab === item.id ? ' active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            <item.icon size={16} />
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      <div className="settings-page-form" role="tabpanel">
        {tab === 'general' ? (
          <section className="settings-page-section">
            <h2>{t('tabGeneral')}</h2>
            <p className="settings-page-hint">{t('settingsGeneralHint')}</p>
            <div className="settings-page-field">
              <label htmlFor="apps-name">{t('name')}</label>
              <input
                id="apps-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="settings-page-field">
              <label htmlFor="apps-desc">{t('description')}</label>
              <textarea
                id="apps-desc"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="settings-page-field">
              <label>{t('apiName')}</label>
              <input type="text" value={app.api_name} disabled readOnly />
            </div>
            {error ? (
              <p className="settings-page-error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="settings-page-actions">
              <button type="button" className="btn btn-primary" disabled={saving} onClick={save}>
                {saving ? t('saving') : t('save')}
              </button>
              {saved ? <span className="settings-page-saved">{t('saved')}</span> : null}
            </div>

            <div className="settings-page-danger">
              <h3>{t('dangerZone')}</h3>
              <p className="settings-page-hint">{t('deleteHint')}</p>
              <button
                type="button"
                className="btn btn-danger"
                disabled={deleting}
                onClick={() => void doDelete()}
              >
                {deleting ? t('deleting') : t('delete')}
              </button>
            </div>
          </section>
        ) : null}

        {tab === 'service' ? (
          <section className="settings-page-section">
            <h2>{t('tabService')}</h2>
            <p className="settings-page-hint">{t('settingsServiceHint')}</p>
            {error ? (
              <p className="settings-page-error" role="alert">
                {error}
              </p>
            ) : null}
            {serviceSavedFlash ? <p className="settings-page-saved">{t('saved')}</p> : null}
            <ModuleServiceBindingEditor
              initial={app.bindings?.k8s}
              saving={serviceSaving}
              onSave={saveService}
            />
          </section>
        ) : null}
      </div>
    </div>
  );
}
