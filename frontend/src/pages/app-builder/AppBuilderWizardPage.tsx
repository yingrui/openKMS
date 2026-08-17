import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { createOntologyApp } from '../../data/ontologyAppsApi';
import { FormField } from '../../styles/design-system';
import './AppBuilderPages.scss';

function slugApiName(name: string): string {
  const base = name
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s-]+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/^(.)/, (c) => c.toLowerCase())
    .replace(/[^a-zA-Z0-9_]/g, '');
  return base || 'app';
}

async function createWithUniqueApiName(name: string): Promise<{ id: string }> {
  const base = slugApiName(name);
  let attempt = 0;
  while (attempt < 8) {
    const api_name = attempt === 0 ? base : `${base}${attempt + 1}`;
    try {
      return await createOntologyApp({ name, api_name, template_id: 'a2ui' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/already exists|409|api_name/i.test(msg) || attempt === 7) throw err;
      attempt += 1;
    }
  }
  throw new Error('Failed to create app');
}

export function AppBuilderWizardPage() {
  const { t } = useTranslation('appBuilder');
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
          const trimmed = name.trim();
          if (!trimmed || busy) return;
          void (async () => {
            setBusy(true);
            setError(null);
            try {
              const app = await createWithUniqueApiName(trimmed);
              navigate(`/app-builder/${app.id}/design`);
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            } finally {
              setBusy(false);
            }
          })();
        }}
      >
        <FormField label={t('name')} hint={t('nameHint')}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('namePlaceholder')}
            required
            autoFocus
          />
        </FormField>

        {error ? <p className="app-builder-page__error" role="alert">{error}</p> : null}

        <div className="app-builder-page__actions">
          <Link to="/app-builder" className="btn btn-secondary">
            {t('cancel')}
          </Link>
          <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
            {t('create')}
          </button>
        </div>
      </form>
    </div>
  );
}
