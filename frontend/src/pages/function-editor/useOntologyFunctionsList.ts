import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { fetchOntologyFunctions, type OntologyFunctionResponse } from '../../data/ontologyFunctionsApi';

export function useOntologyFunctionsList() {
  const { t } = useTranslation('ontology');
  const [items, setItems] = useState<OntologyFunctionResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchOntologyFunctions();
      setItems(res.items);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('functions.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  return { items, loading, reload: load };
}
