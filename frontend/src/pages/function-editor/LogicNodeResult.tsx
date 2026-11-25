import { useTranslation } from 'react-i18next';

/** A node's answer, rendered as fields rather than a JSON blob — the point of a structured output. */
export function NodeRunValue({
  value,
}: {
  value: { output?: unknown; error?: string; tokens?: number; ms?: number };
}) {
  const { t } = useTranslation('ontology');
  if (value.error) {
    return (
      <div className="logic-node__result logic-node__result--failed">
        <span className="logic-node__result-label">{t('editor.logicTraceError')}</span>
        <span>{value.error}</span>
      </div>
    );
  }
  const output = value.output;
  const rows =
    output && typeof output === 'object' && !Array.isArray(output)
      ? Object.entries(output as Record<string, unknown>)
      : null;
  return (
    <div className="logic-node__result">
      <div className="logic-node__result-head">
        <span className="logic-node__result-label">{t('editor.logicTraceOutput')}</span>
        <span className="logic-node__result-meta">
          {t('editor.logicTraceMeta', { tokens: value.tokens ?? 0, ms: value.ms ?? 0 })}
        </span>
      </div>
      {rows ? (
        <dl className="logic-node__result-fields">
          {rows.map(([key, field]) => (
            <div key={key} className="logic-node__result-field">
              <dt>{key}</dt>
              <dd>{typeof field === 'string' ? field : JSON.stringify(field)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="logic-node__result-text">{typeof output === 'string' ? output : JSON.stringify(output)}</p>
      )}
    </div>
  );
}

