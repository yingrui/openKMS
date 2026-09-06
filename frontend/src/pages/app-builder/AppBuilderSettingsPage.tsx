import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Boxes, History, ListTree, Settings } from 'lucide-react';
import { useConfirm } from '../../contexts/ConfirmContext';
import {
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
import '../../styles/settings-page.scss';
import './AppBuilderPages.scss';

type SettingsTab = 'general' | 'resources' | 'loaders' | 'versions';

const TABS: SettingsTab[] = ['general', 'resources', 'loaders', 'versions'];

function parseTab(raw: string | null): SettingsTab {
  if (raw && (TABS as string[]).includes(raw)) return raw as SettingsTab;
  return 'general';
}

export function AppBuilderSettingsPage() {
  const { appId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useTranslation('appBuilder');
  const confirm = useConfirm();
  const [app, setApp] = useState<AppBuilderAppResponse | null>(null);
  const [components, setComponents] = useState<AppBuilderComponent[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [versions, setVersions] = useState<AppBuilderVersion[]>([]);
  const tab = parseTab(searchParams.get('tab'));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [resourcesSaving, setResourcesSaving] = useState(false);
  const [resourcesSavedFlash, setResourcesSavedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otOptions, setOtOptions] = useState<string[]>([]);
  const [actionOptions, setActionOptions] = useState<string[]>([]);
  const [functionOptions, setFunctionOptions] = useState<string[]>([]);

  const setTab = useCallback(
    (next: SettingsTab) => {
      setSearchParams(next === 'general' ? {} : { tab: next }, { replace: true });
      setError(null);
      setSaved(false);
    },
    [setSearchParams],
  );

  const defaultComponent =
    components.find((c) => c.is_default) ?? components[0] ?? null;
  const activeMessages = defaultComponent?.messages ?? [];
  const loadBindings = useMemo(
    () => extractOntoObjectListBindings(activeMessages),
    [activeMessages],
  );
  const objectTypeOptions =
    (app?.bindings?.objectTypes?.length ? app.bindings.objectTypes : otOptions) || [];

  const tabs = useMemo(
    () =>
      [
        { id: 'general' as const, label: t('tabGeneral'), icon: Settings },
        { id: 'resources' as const, label: t('tabResources'), icon: Boxes },
        { id: 'loaders' as const, label: t('tabLoaders'), icon: ListTree },
        { id: 'versions' as const, label: t('tabVersions'), icon: History },
      ] as const,
    [t],
  );

  const reload = useCallback(async () => {
    const design = await fetchAppDesign(appId);
    setApp(design);
    setComponents(design.components || []);
    setName(design.name);
    setDescription(design.description ?? '');
    const vs = await listAppVersions(appId);
    setVersions(vs);
  }, [appId]);

  useEffect(() => {
    void reload().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [reload]);

  useEffect(() => {
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
  }, []);

  const save = () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    void updateApp(appId, { name: name.trim() || undefined, description: description.trim() || null })
      .then(() => setSaved(true))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setSaving(false));
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

  if (!app) return <div className="settings-page">{t('loading')}</div>;

  return (
    <div className="settings-page">
      <Link to={`/app-builder/${appId}/design`} className="settings-page-back">
        <ArrowLeft size={18} />
        <span>{t('backToDesign')}</span>
      </Link>

      <div className="page-header">
        <h1>{t('settingsTitle')}</h1>
        <p className="page-subtitle">{app.name}</p>
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
            <p className="settings-page-hint">{t('settingsGeneralHint')}</p>
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
              <label htmlFor="app-builder-description">{t('description')}</label>
              <textarea
                id="app-builder-description"
                value={description}
                rows={3}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            {error ? <p className="settings-page-error" role="alert">{error}</p> : null}
            <div className="settings-page-actions">
              <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
                {t('save')}
              </button>
              {saved ? <span className="settings-page-saved">{t('saved')}</span> : null}
            </div>
          </section>
        ) : null}

        {tab === 'resources' ? (
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

        {tab === 'loaders' ? (
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

        {tab === 'versions' ? (
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
