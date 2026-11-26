import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { outputLabel, type FlowDraft } from './logicFlow';

/** What the flow answered last time, as fields rather than a JSON blob. */
function OutputValue({ value }: { value: unknown }) {
  const rows =
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.entries(value as Record<string, unknown>)
      : null;
  return rows ? (
    <dl className="logic-output__fields">
      {rows.map(([key, field]) => (
        <div key={key} className="logic-output__field">
          <dt>{key}</dt>
          <dd>{typeof field === 'string' ? field : JSON.stringify(field)}</dd>
        </div>
      ))}
    </dl>
  ) : (
    <p className="logic-output__text">{typeof value === 'string' ? value : JSON.stringify(value)}</p>
  );
}

/**
 * The flow's end, kept outside the scrolling flow.
 *
 * As a sticky card inside the flow it covered the bottom of the prompt — the thing people read most — so it lives in
 * its own strip under the editor: always visible, and never on top of anything.
 */
export function LogicOutputCard({
  draft,
  output,
  disabled,
  onChange,
}: {
  draft: FlowDraft;
  /** The last run's answer. */
  output?: unknown;
  disabled: boolean;
  onChange: (outputRef: string) => void;
}) {
  const { t } = useTranslation('ontology');
  // Collapsed to one line by default: the answer is usually checked, not read field by field, and every pixel here is
  // taken from the flow above it.
  const [open, setOpen] = useState(false);
  const summary = (() => {
    if (!output || typeof output !== 'object' || Array.isArray(output)) {
      return typeof output === 'string' ? output : '';
    }
    return Object.entries(output as Record<string, unknown>)
      .filter(([, value]) => value !== null && typeof value !== 'object')
      .slice(0, 3)
      .map(([key, value]) => `${key}: ${String(value)}`)
      .join(' · ');
  })();
  return (
    <section className="logic-output" aria-label={t('editor.logicOutputSource')}>
      <div className="logic-output__head">
        <span className="logic-output__title">{t('editor.logicOutputSource')}</span>
        <select
          className="ds-control logic-output__select"
          aria-label={t('editor.logicOutputSource')}
          value={draft.output}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        >
          <option value="">{t('editor.logicOutputLast')}</option>
          {draft.nodes.map((node, index) => (
            <option key={index} value={node.id.trim()}>
              {outputLabel(node, index)}
            </option>
          ))}
        </select>
        {summary ? (
          <button type="button" className="logic-output__toggle" onClick={() => setOpen((value) => !value)}>
            {open ? t('editor.logicFieldsHide') : t('editor.logicFieldsShowAll')}
          </button>
        ) : null}
      </div>
      {output === undefined || output === null ? (
        <p className="logic-output__hint">{t('editor.logicOutputEmpty')}</p>
      ) : open ? (
        <OutputValue value={output} />
      ) : (
        <p className="logic-output__summary" title={summary}>
          {summary || JSON.stringify(output)}
        </p>
      )}
    </section>
  );
}
