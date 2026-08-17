import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { createOntologyApp, type OntologyAppBindings } from '../../data/ontologyAppsApi';
import './AppBuilderPages.scss';

const EMPTY_BINDINGS: OntologyAppBindings = {
  objectType: '',
  columnProperty: '',
  columns: [],
  cardTitleProperty: '',
  createAction: '',
  updateAction: '',
  setStatusAction: '',
  deleteAction: '',
  suggestFunction: '',
};

function trimOrNull(value: string | null | undefined): string | null {
  const v = (value || '').trim();
  return v || null;
}

export function AppBuilderWizardPage() {
  const { t } = useTranslation('appBuilder');
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [apiName, setApiName] = useState('');
  const [bindings, setBindings] = useState(EMPTY_BINDINGS);
  const [columnsText, setColumnsText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const setField = (key: keyof OntologyAppBindings, value: string) => {
    setBindings((b) => ({ ...b, [key]: value }));
  };

  return (
    <div className="app-builder-page">
      <header className="page-header">
        <h1>{t('wizardTitle')}</h1>
        <p className="page-subtitle">{t('wizardSubtitle')}</p>
      </header>

      <form
        className="app-builder-wizard"
        onSubmit={(e) => {
          e.preventDefault();
          void (async () => {
            setBusy(true);
            setError(null);
            try {
              const cols = columnsText
                .split(',')
                .map((c) => c.trim())
                .filter(Boolean);
              if (!cols.length) {
                setError(t('validationColumns'));
                return;
              }
              const app = await createOntologyApp({
                name: name.trim(),
                api_name: apiName.trim(),
                template_id: 'a2ui',
                bindings: {
                  objectType: bindings.objectType.trim(),
                  columnProperty: (bindings.columnProperty || '').trim(),
                  columns: cols,
                  cardTitleProperty: (bindings.cardTitleProperty || '').trim(),
                  createAction: trimOrNull(bindings.createAction),
                  updateAction: trimOrNull(bindings.updateAction),
                  setStatusAction: trimOrNull(bindings.setStatusAction),
                  deleteAction: trimOrNull(bindings.deleteAction),
                  suggestFunction: trimOrNull(bindings.suggestFunction),
                },
              });
              navigate(`/app-builder/${app.id}/design`);
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            } finally {
              setBusy(false);
            }
          })();
        }}
      >
        <label>
          {t('name')}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('namePlaceholder')}
            required
          />
        </label>
        <label>
          {t('apiName')}
          <input
            value={apiName}
            onChange={(e) => setApiName(e.target.value)}
            placeholder={t('apiNamePlaceholder')}
            required
          />
        </label>
        <label>
          {t('objectType')}
          <input
            value={bindings.objectType}
            onChange={(e) => setField('objectType', e.target.value)}
            placeholder={t('objectTypePlaceholder')}
            required
          />
        </label>
        <label>
          {t('columnProperty')}
          <input
            value={bindings.columnProperty || ''}
            onChange={(e) => setField('columnProperty', e.target.value)}
            placeholder={t('columnPropertyPlaceholder')}
            required
          />
        </label>
        <label>
          {t('columns')}
          <input
            value={columnsText}
            onChange={(e) => setColumnsText(e.target.value)}
            placeholder={t('columnsPlaceholder')}
            required
          />
        </label>
        <label>
          {t('cardTitleProperty')}
          <input
            value={bindings.cardTitleProperty || ''}
            onChange={(e) => setField('cardTitleProperty', e.target.value)}
            placeholder={t('cardTitlePropertyPlaceholder')}
            required
          />
        </label>
        <label>
          {t('createAction')}
          <input
            value={bindings.createAction || ''}
            onChange={(e) => setField('createAction', e.target.value)}
            placeholder={t('actionPlaceholder')}
          />
        </label>
        <label>
          {t('updateAction')}
          <input
            value={bindings.updateAction || ''}
            onChange={(e) => setField('updateAction', e.target.value)}
            placeholder={t('actionPlaceholder')}
          />
        </label>
        <label>
          {t('setStatusAction')}
          <input
            value={bindings.setStatusAction || ''}
            onChange={(e) => setField('setStatusAction', e.target.value)}
            placeholder={t('actionPlaceholder')}
          />
        </label>
        <label>
          {t('deleteAction')}
          <input
            value={bindings.deleteAction || ''}
            onChange={(e) => setField('deleteAction', e.target.value)}
            placeholder={t('actionPlaceholder')}
          />
        </label>
        <label>
          {t('suggestFunction')}
          <input
            value={bindings.suggestFunction || ''}
            onChange={(e) => setField('suggestFunction', e.target.value)}
            placeholder={t('actionPlaceholder')}
          />
        </label>

        {error ? <p className="app-builder-page__error">{error}</p> : null}
        <p className="app-builder-page__muted">
          {t('wizardMissingHint')}{' '}
          <Link to="/ontology-manager/object-types">{t('manager')}</Link> ·{' '}
          <Link to="/function-editor">{t('functionEditor')}</Link>
        </p>

        <div className="app-builder-page__actions">
          <Link to="/app-builder" className="btn btn-secondary">
            {t('cancel')}
          </Link>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {t('create')}
          </button>
        </div>
      </form>
    </div>
  );
}
