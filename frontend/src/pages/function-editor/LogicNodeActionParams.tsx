import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import type { ModelNode } from './logicFlow';

export function ActionParams({
  node,
  references,
  disabled,
  onChange,
}: {
  node: ModelNode;
  references: string[];
  disabled: boolean;
  onChange: (changes: Partial<ModelNode>) => void;
}) {
  const { t } = useTranslation('ontology');
  return (
    <div className="logic-node__params">
      <span className="logic-node__label">
        {t(node.kind === 'transform' ? 'editor.logicTemplate' : 'editor.logicParams')}
      </span>
      {node.params.map((param, index) => (
        <div key={index} className="logic-node__param">
          <input
            className="ds-control logic-node__param-key"
            value={param.key}
            placeholder={t('editor.logicParamKey')}
            aria-label={t('editor.logicParamKey')}
            onChange={(e) => onChange({ params: replaceAt(node.params, index, { key: e.target.value }) })}
            disabled={disabled}
          />
          <input
            className="ds-control logic-node__param-value"
            value={param.value}
            placeholder={`{{${references[references.length - 1] ?? 'input'}.field}}`}
            aria-label={t('editor.logicParamValue')}
            onChange={(e) => onChange({ params: replaceAt(node.params, index, { value: e.target.value }) })}
            disabled={disabled}
          />
          <button
            type="button"
            className="ds-table-icon-link"
            aria-label={t('shared.delete')}
            onClick={() => onChange({ params: node.params.filter((_, i) => i !== index) })}
            disabled={disabled}
          >
            <Trash2 size={14} aria-hidden />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => onChange({ params: [...node.params, { key: '', value: '' }] })}
        disabled={disabled}
      >
        <Plus size={14} aria-hidden />
        {t('editor.logicAddParam')}
      </button>
      <p className="logic-node__hint">
        {t(node.kind === 'transform' ? 'editor.logicTemplateHint' : 'editor.logicParamsHint')}
      </p>
    </div>
  );
}


function replaceAt<T>(rows: T[], index: number, patch: Partial<T>): T[] {
  return rows.map((row, i) => (i === index ? { ...row, ...patch } : row));
}
