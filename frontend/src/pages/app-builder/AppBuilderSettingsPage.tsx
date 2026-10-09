import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Boxes, History, ListTree, Server, Settings } from 'lucide-react';
import { useConfirm } from '../../contexts/ConfirmContext';
import {
  deleteApp,
  fetchAppDesign,
  listAppVersions,
  rollbackApp,
  updateApp,
  type AppBuilderAppResponse,
  type AppBuilderBindings,
  type AppBuilderComponent,
  type AppBuilderVersion,
} from '../../data/appBuilderApi';
import { fetchObjectTypes } from '../../data/ontologyApi';
import { fetchOntologyActionTypes } from '../../data/ontologyActionsApi';
import { fetchOntologyFunctions } from '../../data/ontologyFunctionsApi';
import { DataModelLoadEditor } from './a2ui/DataModelLoadEditor';
import { ResourcesEditor } from './a2ui/ResourcesEditor';
import {
  addOntoObjectListBinding,
  extractOntoObjectListBindings,
  removeOntoObjectListBinding,
  updateOntoObjectListBinding,
  type OntoObjectListBinding,
} from './a2ui/dataModelInspect';
import { ModuleServiceBindingEditor } from './ModuleServiceBindingEditor';
import '../../styles/settings-page.scss';
import './AppBuilderPages.scss';

type A2uiTab = 'general' | 'resources' | 'loaders' | 'versions';
type ModuleTab = 'general' | 'service';
type SettingsTab = A2uiTab | ModuleTab;

const A2UI_TABS: A2uiTab[] = ['general', 'resources', 'loaders', 'versions'];
const MODULE_TABS: ModuleTab[] = ['general', 'service'];

function isModuleApp(app: AppBuilderAppResponse | null): boolean {
  if (!app) return false;
  return (app.app_kind || app.template_id) === 'module';
}

function parseTab(raw: string | null, module: boolean): SettingsTab {
  const allowed = module ? MODULE_TABS : A2UI_TABS;
  if (raw && (allowed as string[]).includes(raw)) return raw as SettingsTab;
  return 'general';
}

export function AppBuilderSettingsPage() {
  const { appId = '' } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useTranslation('appBuilder');
  const confirm = useConfirm();
  const [app, setApp] = useState<AppBuilderAppResponse | null>(null);
  const [components, setComponents] = useState<AppBuilderComponent[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [versions, setVersions] = useState<AppBuilderVersion[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [serviceSaving, setServiceSaving] = useState(false);
  const [serviceSavedFlash, setServiceSavedFlash] = useState(false);
  const [resourcesSaving, setResourcesSaving] = useState(false);
  const [resourcesSavedFlash, setResourcesSavedFlash] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otOptions, setOtOptions] = useState<string[]>([]);
  const [actionOptions, setActionOptions] = useState<string[]>([]);
  const [functionOptions, setFunctionOptions] = useState<string[]>([]);

  const module = isModuleApp(app);
  const tab = parseTab(searchParams.get('tab'), module);

  const setTab = useCallback(
    (next: SettingsTab) => {
      setSearchParams(next === 'general' ? {} : { tab: next }, { replace: true });
      setError(null);
      setSaved(false);
    },
    [setSearchParams],
  );

  // Drop invalid ?tab= for the other kind (e.g. resources on a module app).
  useEffect(() => {
    if (!app) return;
    const raw = searchParams.get('tab');
    if (!raw) return;
    const allowed = module ? MODULE_TABS : A2UI_TABS;
    if (!(allowed as string[]).includes(raw)) {
      setSearchParams({}, { replace: true });
    }
  }, [app, module, searchParams, setSearchParams]);

  const defaultComponent =
    components.find((c) => c.is_default) ?? components[0] ?? null;
  const activeMessages = defaultComponent?.messages ?? [];
  const loadBindings = useMemo(
    () => extractOntoObjectListBindings(activeMessages),
    [activeMessages],
  );
  const objectTypeOptions =
    (app?.bindings?.objectTypes?.length ? app.bindings.objectTypes : otOptions) || [];

  const tabs = useMemo(() => {
    if (module) {
      return [
        { id: 'general' as const, label: t('tabGeneral'), icon: Settings },
        { id: 'service' as const, label: t('tabService'), icon: Server },
      ];
    }
    return [
      { id: 'general' as const, label: t('tabGeneral'), icon: Settings },
      { id: 'resources' as const, label: t('tabResources'), icon: Boxes },
      { id: 'loaders' as const, label: t('tabLoaders'), icon: ListTree },
      { id: 'versions' as const, label: t('tabVersions'), icon: History },
    ];
  }, [module, t]);

  const reload = useCallback(async () => {
    const design = await fetchAppDesign(appId);
    setApp(design);
    setComponents(design.components || []);
    setName(design.name);
    setDescription(design.description ?? '');
    if ((design.app_kind || design.template_id) !== 'module') {
      const vs = await listAppVersions(appId);
      setVersions(vs);
    } else {
      setVersions([]);
    }
  }, [appId]);

  useEffect(() => {
    void reload().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [reload]);

  useEffect(() => {
    if (!app || module) return;
    void (async () => {
      try {
        const [ots, acts, fns] = await Promise.all([
          fetchObjectTypes(),
          fetchOntologyActionTypes(),
          fetchOntologyFunctions(),
        ]);
        setOtOptions(
          [...new Set((ots.items || []).map((o) => o.name).filter(Boolean))].sort(),
        );
        setActionOptions(
          [...new Set((acts || []).map((a) => a.api_name).filter(Boolean))].sort(),
        );
        setFunctionOptions(
          [...new Set((fns.items || []).map((f) => f.api_name).filter(Boolean))].sort(),
        );
      } catch {
        /* options stay empty */
      }
    })();
  }, [app, module]);

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

  const saveResources = (bindings: AppBuilderBindings) => {
    setResourcesSaving(true);
    setError(null);
    void updateApp(appId, { bindings })
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
        setResourcesSavedFlash(true);
        window.setTimeout(() => setResourcesSavedFlash(false), 2000);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setResourcesSaving(false));
  };

  const saveComponentsMessages = (messages: Record<string, unknown>[]) => {
    if (!defaultComponent) return;
    const next = components.map((c) =>
      c.id === defaultComponent.id ? { ...c, messages } : c,
    );
    setComponents(next);
    void updateApp(appId, { components: next }).catch((e) =>
      setError(e instanceof Error ? e.message : String(e)),
    );
  };

  const saveLoader = (binding: OntoObjectListBinding) => {
    try {
      setError(null);
      saveComponentsMessages(updateOntoObjectListBinding(activeMessages, binding));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const removeLoader = (componentId: string) => {
    try {
      setError(null);
      saveComponentsMessages(removeOntoObjectListBinding(activeMessages, componentId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const addLoader = (binding: OntoObjectListBinding) => {
    try {
      setError(null);
      saveComponentsMessages(addOntoObjectListBinding(activeMessages, binding));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
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
      navigate('/app-builder', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDeleting(false);
    }
  };

  if (!app) return <div className="settings-page">{t('loading')}</div>;

  return (
    <div className="settings-page">
      {module ? (
        <Link to="/app-builder" className="settings-page-back">
          <ArrowLeft size={18} />
          <span>{t('backToList')}</span>
        </Link>
      ) : (
        <Link to={`/app-builder/${appId}/design`} className="settings-page-back">
          <ArrowLeft size={18} />
          <span>{t('backToDesign')}</span>
        </Link>
      )}

      <div className="page-header">
        <h1>{t('settingsTitle')}</h1>
        <p className="page-subtitle">
          {app.name}
          {module ? ` · ${t('kindModule')}` : ''}
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
            {item.id === 'loaders' && loadBindings.length > 0 ? (
              <span className="app-builder-settings-tab-count">{loadBindings.length}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="settings-page-form" role="tabpanel">
        {tab === 'general' ? (
          <section className="settings-page-section">
            <h2>{t('tabGeneral')}</h2>
            <p className="settings-page-hint">
              {module ? t('settingsGeneralHintModule') : t('settingsGeneralHint')}
            </p>
            <div className="settings-page-field">
              <label htmlFor="app-builder-name">{t('name')}</label>
              <input
                id="app-builder-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="settings-page-field">
              <label htmlFor="app-builder-api-name">{t('apiName')}</label>
              <input
                id="app-builder-api-name"
                type="text"
                value={app.api_name}
                readOnly
                disabled
                spellCheck={false}
              />
            </div>
            <div className="settings-page-field">
              <label htmlFor="app-builder-description">{t('description')}</label>
              <textarea
                id="app-builder-description"
                value={description}
                rows={3}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            {error && tab === 'general' ? (
              <p className="settings-page-error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="settings-page-actions">
              <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
                {t('save')}
              </button>
              {app.status === 'published' ? (
                <Link to={`/apps/${app.id}`} className="btn btn-secondary">
                  {t('open')}
                </Link>
              ) : null}
              {saved ? <span className="settings-page-saved">{t('saved')}</span> : null}
            </div>
            {module ? (
              <div className="settings-page-danger">
                <h3>{t('settingsDangerTitle')}</h3>
                <p className="settings-page-hint">{t('settingsDangerHint')}</p>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => void doDelete()}
                  disabled={deleting}
                >
                  {deleting ? t('saving') : t('delete')}
                </button>
              </div>
            ) : null}
          </section>
        ) : null}

        {module && tab === 'service' ? (
          <section className="settings-page-section">
            <h2>{t('tabService')}</h2>
            <p className="settings-page-hint">{t('settingsServiceHint')}</p>
            {error ? <p className="settings-page-error" role="alert">{error}</p> : null}
            <ModuleServiceBindingEditor
              key={`${app.bindings?.k8s?.cluster_id}-${app.bindings?.k8s?.service}-${app.bindings?.k8s?.port}`}
              initial={app.bindings?.k8s}
              saving={serviceSaving}
              onSave={saveService}
            />
            {serviceSavedFlash ? (
              <p className="settings-page-saved">{t('settingsServiceSaved')}</p>
            ) : null}
            {app.bindings_stale || app.missing_bindings?.length ? (
              <p className="settings-page-error" role="alert">
                {t('missing')}: {(app.missing_bindings || ['k8s']).join(', ')}
              </p>
            ) : null}
          </section>
        ) : null}

        {!module && tab === 'resources' ? (
          <section className="settings-page-section">
            <h2>{t('tabResources')}</h2>
            <p className="settings-page-hint">{t('settingsResourcesHint')}</p>
            {error ? <p className="settings-page-error" role="alert">{error}</p> : null}
            <ResourcesEditor
              bindings={app.bindings || {}}
              objectTypeOptions={otOptions}
              actionOptions={actionOptions}
              functionOptions={functionOptions}
              saving={resourcesSaving}
              onSave={saveResources}
            />
            {resourcesSavedFlash ? (
              <p className="settings-page-saved">{t('resourcesSaved')}</p>
            ) : null}
            {app.missing_bindings?.filter((m) => m !== 'legacy_board_bindings').length ? (
              <p className="settings-page-error" role="alert">
                {t('missing')}:{' '}
                {app.missing_bindings.filter((m) => m !== 'legacy_board_bindings').join(', ')}
              </p>
            ) : null}
          </section>
        ) : null}

        {!module && tab === 'loaders' ? (
          <section className="settings-page-section">
            <h2>{t('tabLoaders')}</h2>
            <p className="settings-page-hint">{t('settingsLoadersHint')}</p>
            {!objectTypeOptions.length ? (
              <p className="settings-page-hint">{t('settingsLoadersNeedResources')}</p>
            ) : null}
            {error ? <p className="settings-page-error" role="alert">{error}</p> : null}
            <DataModelLoadEditor
              bindings={loadBindings}
              objectTypeOptions={objectTypeOptions}
              onSave={saveLoader}
              onRemove={removeLoader}
              onAdd={addLoader}
            />
          </section>
        ) : null}

        {!module && tab === 'versions' ? (
          <section className="settings-page-section">
            <h2>{t('tabVersions')}</h2>
            <p className="settings-page-hint">{t('settingsVersionsHint')}</p>
            {versions.length === 0 ? (
              <p className="settings-page-hint">{t('versionsEmpty')}</p>
            ) : (
              <ul className="app-builder-settings-versions">
                {versions.map((v) => (
                  <li key={v.id} className="app-builder-settings-version">
                    <div className="app-builder-settings-version__main">
                      <div className="app-builder-settings-version__title">
                        <strong>v{v.version}</strong>
                        {v.is_current ? (
                          <span className="app-builder-page__badge">{t('currentVersion')}</span>
                        ) : null}
                      </div>
                      <div className="app-builder-page__meta">
                        {v.created_by_name ? `${v.created_by_name} · ` : ''}
                        {new Date(v.created_at).toLocaleString()}
                      </div>
                    </div>
                    {!v.is_current ? (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => void doRollback(v.id)}
                      >
                        {t('rollback')}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {error ? <p className="settings-page-error" role="alert">{error}</p> : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
