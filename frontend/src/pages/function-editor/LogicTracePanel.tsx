import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check } from 'lucide-react';

export type TraceNode = {
  id: string;
  kind?: string;
  ok?: boolean;
  model_id?: string | null;
  prompt_sent?: string;
  output?: unknown;
  error?: string;
  duration_ms?: number;
  missing_references?: string[];
  usage?: {
    requests?: number;
    input_tokens?: number | null;
    output_tokens?: number | null;
    total_tokens?: number | null;
  };
};

/** A run's trace: one card per node, in execution order, with what was actually sent. */
export function LogicTracePanel({ trace }: { trace: Record<string, unknown> | null | undefined }) {
  const { t } = useTranslation('ontology');
  const nodes = Array.isArray(trace?.nodes) ? (trace?.nodes as TraceNode[]) : [];
  if (!nodes.length) return null;

  return (
    <section className="logic-trace" aria-label={t('editor.logicTrace')}>
      <h3 className="logic-trace__title">{t('editor.logicTrace')}</h3>
      <ol className="logic-trace__nodes">
        {nodes.map((node, index) => (
          <li
            key={`${node.id}-${index}`}
            className={`logic-trace__node${node.ok ? '' : ' logic-trace__node--failed'}`}
          >
            <div className="logic-trace__head">
              {node.ok ? (
                <Check size={14} aria-hidden className="logic-trace__ok" />
              ) : (
                <AlertTriangle size={14} aria-hidden className="logic-trace__fail" />
              )}
              <span className="logic-trace__id">{node.id}</span>
              {node.model_id ? <span className="logic-trace__model">{node.model_id}</span> : null}
              <span className="logic-trace__meta">
                {t('editor.logicTraceMeta', {
                  tokens: node.usage?.total_tokens ?? 0,
                  ms: node.duration_ms ?? 0,
                })}
              </span>
            </div>
            {node.error ? <p className="logic-trace__error">{node.error}</p> : null}
            {node.missing_references?.length ? (
              <p className="logic-trace__warn">
                {t('editor.logicTraceMissing', { refs: node.missing_references.join(', ') })}
              </p>
            ) : null}
            {node.prompt_sent ? (
              <div className="logic-trace__block">
                <span className="logic-trace__label">{t('editor.logicTracePrompt')}</span>
                <pre className="logic-trace__pre">{node.prompt_sent}</pre>
              </div>
            ) : null}
            {node.output !== undefined ? (
              <div className="logic-trace__block">
                <span className="logic-trace__label">{t('editor.logicTraceOutput')}</span>
                <pre className="logic-trace__pre">{JSON.stringify(node.output, null, 2)}</pre>
              </div>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
