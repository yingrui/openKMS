import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { fetchOntologyFunctions, type OntologyFunctionResponse } from '../../data/ontologyFunctionsApi';

type Props = {
  currentApiName?: string;
  onInsertSnippet: (snippet: string) => void;
};

export function AvailableQueriesPanel({ currentApiName, onInsertSnippet }: Props) {
  const { t } = useTranslation('ontology');
  const [items, setItems] = useState<OntologyFunctionResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const res = await fetchOntologyFunctions();
        if (cancelled) return;
        setItems(res.items.filter((fn) => fn.published_version_id && fn.api_name !== currentApiName));
      } catch (e: unknown) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : t('functions.loadFailed'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentApiName, t]);

  return (
    <aside className="function-editor-queries" aria-label={t('editor.availableQueries')}>
      <div className="function-editor-queries__header">
        <span className="function-editor-queries__title">{t('editor.availableQueries')}</span>
        <span className="function-editor-queries__hint">{t('editor.availableQueriesHint')}</span>
      </div>
      <div className="function-editor-queries__body">
        {loading && <p className="function-editor-queries__empty">{t('shared.loading')}</p>}
        {!loading && items.length === 0 && (
          <p className="function-editor-queries__empty">{t('editor.noPublishedQueries')}</p>
        )}
        {!loading &&
          items.map((fn) => (
            <button
              key={fn.id}
              type="button"
              className="function-editor-queries__item"
              title={fn.description || fn.display_name}
              onClick={() =>
                onInsertSnippet(
                  `result = client("${fn.api_name}").execute_function({})\n`,
                )
              }
            >
              <span className="function-editor-queries__api">{fn.api_name}</span>
              <span className="function-editor-queries__name">{fn.display_name}</span>
            </button>
          ))}
      </div>
    </aside>
  );
}
