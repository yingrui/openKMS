import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { EntityViewHeader, EntityViewPanel } from '../../shared/EntityViewShell';
import { useWorkforceDetail } from './workforceDetailContext';

/**
 * The exact request an integrator sends.
 *
 * It exists because "there is a credential" is not enough to call the service: the reader needs the
 * shape of the body, the endpoint, and which knowledge source the question names. Shown rather than
 * executed — a call from this page would run as *you*, which is the thing the credential replaces.
 */
export function WorkforceCallTab() {
  const { t } = useTranslation('workforce');
  const { agent } = useWorkforceDetail();
  const kbId = agent.knowledge_bases[0]?.knowledge_base_id ?? '<knowledge-base-id>';

  const curl = useMemo(
    () =>
      [
        `curl -X POST \\`,
        `  ${window.location.origin}/api/workforce/agents/${agent.id}/ask \\`,
        `  -H "Authorization: Bearer wfks.<credential-id>.<secret>" \\`,
        `  -H "Content-Type: application/json" \\`,
        `  -d '{"kb_id": "${kbId}", "question": "..."}'`,
      ].join('\n'),
    [agent.id, kbId],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(curl);
      toast.success(t('copied'));
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      <EntityViewHeader title={t('tryTitle')} subtitle={t('tryLead')} />
      <EntityViewPanel>
      <pre className="workforce-curl">{curl}</pre>
      <button type="button" className="btn btn-secondary" onClick={() => void copy()}>
        <Copy size={16} aria-hidden />
        {t('copyCurl')}
      </button>
      </EntityViewPanel>
    </>
  );
}
