import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWorkforceAgent, type WorkforceAgentDetail } from '../../data/workforceApi';
import { fetchKnowledgeBase, type KnowledgeBaseResponse } from '../../data/knowledgeBasesApi';
import { ListPage } from '../../styles/design-system';
import { AgentChatPage } from './chat/AgentChatPage';

/**
 * The Workforce entry to a conversation.
 *
 * It **opens the existing Q&A screen** rather than re-drawing one: the conversation is the screen the
 * knowledge base already had — hero, bubbles, sources, feedback, files rail — and a second rendering of it
 * would be a second look for the same object. What moves is the way in: from the agent, which is the thing
 * that decides how the answers are produced.
 *
 * A conversation belongs to **one knowledge source**: citations have to come from the same corpus, so an
 * agent with several sources asks which one first. The source then owns the thread.
 */
export function WorkforceChat() {
  const { t } = useTranslation('workforce');
  const { agentId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const [agent, setAgent] = useState<WorkforceAgentDetail | null>(null);
  const [kb, setKb] = useState<KnowledgeBaseResponse | null>(null);
  const [loading, setLoading] = useState(true);

  /** The source this URL names, or the only one the agent has. Empty when the reader must choose. */
  const wanted = searchParams.get('kb');
  const sourceId = agent
    ? agent.knowledge_bases.some((b) => b.knowledge_base_id === wanted)
      ? (wanted as string)
      : agent.knowledge_bases.length === 1
        ? agent.knowledge_bases[0].knowledge_base_id
        : ''
    : '';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const loaded = await fetchWorkforceAgent(agentId);
        if (!cancelled) setAgent(loaded);
      } catch (e: unknown) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : t('loadFailed'));
          setAgent(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId, t]);

  useEffect(() => {
    if (!sourceId) {
      setKb(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const loaded = await fetchKnowledgeBase(sourceId);
        if (!cancelled) setKb(loaded);
      } catch (e: unknown) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : t('loadFailed'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sourceId, t]);

  if (loading) {
    return (
      <div className="ds-page">
        <p className="page-subtitle">
          <Loader2 className="spin" size={16} aria-hidden /> {t('loading')}
        </p>
      </div>
    );
  }
  if (!agent) return null;

  if (sourceId) {
    // The source's own screen while its row is still in flight; the chat mounts once it is here.
    if (!kb || kb.id !== sourceId) {
      return (
        <div className="ds-page">
          <p className="page-subtitle">
            <Loader2 className="spin" size={16} aria-hidden /> {t('loading')}
          </p>
        </div>
      );
    }
    return <AgentChatPage agentId={agent.id} kb={kb} />;
  }

  const sources = agent.knowledge_bases;
  return (
    <ListPage
      title={t('chatPickSourceTitle')}
      subtitle={t('chatPickSourceLead', { name: agent.name })}
      actions={
        <Link className="btn btn-secondary" to={`/workforce/${agent.id}`}>
          <ArrowLeft size={16} aria-hidden />
          {agent.name}
        </Link>
      }
    >
      {sources.length === 0 ? (
        <p className="ds-field__hint">{t('noKnowledge')}</p>
      ) : (
        <div className="ds-table-wrap">
          <table className="ds-table">
            <tbody>
              {sources.map((b) => (
                <tr key={b.id}>
                  <td>
                    <Link to={`/workforce/${agent.id}/chat?kb=${encodeURIComponent(b.knowledge_base_id)}`}>
                      {b.label || b.knowledge_base_name || b.knowledge_base_id}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ListPage>
  );
}
