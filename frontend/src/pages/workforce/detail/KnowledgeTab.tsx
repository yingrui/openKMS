import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  addWorkforceKb,
  removeWorkforceKb,
} from '../../../data/workforceApi';
import { fetchKnowledgeBases, type KnowledgeBaseResponse } from '../../../data/knowledgeBasesApi';
import { FormField } from '../../../styles/design-system';
import { EntityViewHeader, EntityViewPanel } from '../../shared/EntityViewShell';
import { useWorkforceDetail } from './workforceDetailContext';

/** Which corpora this agent may answer from. One question names one source; the bindings are additive. */
export function WorkforceKnowledgeTab() {
  const { t } = useTranslation('workforce');
  const { agent, reload } = useWorkforceDetail();
  const [kbs, setKbs] = useState<KnowledgeBaseResponse[]>([]);
  const [kbPick, setKbPick] = useState('');
  const [busy, setBusy] = useState(false);

  const loadOptions = useCallback(async () => {
    try {
      setKbs((await fetchKnowledgeBases({ limit: 200, offset: 0 })).items);
    } catch {
      // The picker is a convenience; a failed option load must not hide the agent's own bindings.
    }
  }, []);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      await reload();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('bindingFailed'));
    } finally {
      setBusy(false);
    }
  };

  const boundKbIds = new Set(agent.knowledge_bases.map((b) => b.knowledge_base_id));

  return (
    <>
      <EntityViewHeader title={t('knowledgeTitle')} subtitle={t('knowledgeLead')} />
      <EntityViewPanel>
      
        {agent.knowledge_bases.length === 0 ? (
          <p className="ds-field__hint">{t('noKnowledge')}</p>
        ) : (
          <ul className="workforce-bindings">
            {agent.knowledge_bases.map((binding) => (
              <li key={binding.id}>
                <span>{binding.label || binding.knowledge_base_name || binding.knowledge_base_id}</span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={busy}
                  onClick={() => void run(() => removeWorkforceKb(agent.id, binding.id))}
                >
                  <X size={14} aria-hidden />
                  {t('unbind')}
                </button>
              </li>
            ))}
          </ul>
        )}
        <FormField label={t('addKnowledge')} hint={kbs.length === 0 ? t('noReadableKbs') : undefined}>
          <div className="workforce-inline-form">
            <select
              className="ds-control"
              value={kbPick}
              onChange={(e) => setKbPick(e.target.value)}
            >
              <option value="">—</option>
              {kbs
                .filter((kb) => !boundKbIds.has(kb.id))
                .map((kb) => (
                  <option key={kb.id} value={kb.id}>
                    {kb.name}
                  </option>
                ))}
            </select>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy || !kbPick}
              onClick={() =>
                void run(async () => {
                  await addWorkforceKb(agent.id, { knowledge_base_id: kbPick });
                  setKbPick('');
                })
              }
            >
              <Plus size={16} aria-hidden />
              {t('bind')}
            </button>
          </div>
        </FormField>
      </EntityViewPanel>
    </>
  );
}
