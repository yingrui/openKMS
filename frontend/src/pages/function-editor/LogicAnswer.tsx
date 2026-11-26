import { useState } from 'react';
import { useTranslation } from 'react-i18next';

/** The last run's answer, as fields rather than a JSON blob. */
function AnswerFields({ value }: { value: Record<string, unknown> }) {
  return (
    <dl className="logic-answer__fields">
      {Object.entries(value).map(([key, field]) => (
        <div key={key} className="logic-answer__field">
          <dt>{key}</dt>
          <dd>{typeof field === 'string' ? field : JSON.stringify(field)}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * What the flow answered, in the run panel — where the run happened.
 *
 * It used to be a strip under the flow with a dropdown reading "Answer from", which asked the reader to parse a
 * sentence that was really two separate facts: which node answers (a property of the flow) and what it answered (a
 * property of the run).
 */
export function LogicAnswer({ output }: { output?: unknown }) {
  const { t } = useTranslation('ontology');
  const [open, setOpen] = useState(false);

  const isObject = Boolean(output) && typeof output === 'object' && !Array.isArray(output);
  const summary = isObject
    ? Object.entries(output as Record<string, unknown>)
        .filter(([, value]) => value !== null && typeof value !== 'object')
        .slice(0, 3)
        .map(([key, value]) => `${key}: ${String(value)}`)
        .join(' · ')
    : typeof output === 'string'
      ? output
      : '';

  return (
    <section className="logic-answer" aria-label={t('editor.logicAnswer')}>
      <div className="logic-answer__head">
        <span className="logic-answer__title">{t('editor.logicAnswer')}</span>
        {isObject ? (
          <button type="button" className="logic-answer__toggle" onClick={() => setOpen((value) => !value)}>
            {open ? t('editor.logicFieldsHide') : t('editor.logicFieldsShowAll')}
          </button>
        ) : null}
      </div>
      {output === undefined || output === null ? (
        <p className="logic-answer__hint">{t('editor.logicOutputEmpty')}</p>
      ) : open && isObject ? (
        <AnswerFields value={output as Record<string, unknown>} />
      ) : (
        <p className="logic-answer__summary" title={summary}>
          {summary || JSON.stringify(output)}
        </p>
      )}
    </section>
  );
}
