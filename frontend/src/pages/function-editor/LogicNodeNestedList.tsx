import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { newNode, type ModelNode } from './logicFlow';

/**
 * The body of a nested container (a branch, a loop): model or action nodes only.
 *
 * Same one-level rule the backend enforces — a body cannot hold another condition or loop — so the editor refuses to
 * build a shape the executor would reject.
 */
export function NestedNodeList({
  nodes,
  disabled,
  onChange,
}: {
  nodes: ModelNode[];
  disabled: boolean;
  onChange: (next: ModelNode[]) => void;
}) {
  const { t } = useTranslation('ontology');
  const patch = (index: number, changes: Partial<ModelNode>) => {
    onChange(nodes.map((node, i) => (i === index ? { ...node, ...changes } : node)));
  };

  return (
    <>
      {nodes.map((child, index) => (
        <div key={index} className="logic-branch__node">
          <select
            className="ds-control logic-node__tool-kind"
            value={child.kind}
            aria-label={t('editor.logicNodeKind')}
            onChange={(e) => patch(index, { kind: e.target.value as 'model' | 'action' })}
            disabled={disabled}
          >
            <option value="model">{t('editor.logicNodeKindModel')}</option>
            <option value="action">{t('editor.logicNodeKindAction')}</option>
          </select>
          {child.kind === 'action' ? (
            <input
              className="ds-control logic-node__action-type"
              value={child.actionType}
              placeholder={t('editor.logicActionType')}
              aria-label={t('editor.logicActionType')}
              onChange={(e) => patch(index, { actionType: e.target.value })}
              disabled={disabled}
            />
          ) : (
            <textarea
              className="ds-control logic-node__prompt logic-branch__prompt"
              rows={2}
              value={child.prompt}
              placeholder={t('editor.logicPromptPlaceholder')}
              aria-label={t('editor.logicPrompt')}
              onChange={(e) => patch(index, { prompt: e.target.value })}
              disabled={disabled}
            />
          )}
          <button
            type="button"
            className="ds-table-icon-link"
            aria-label={t('shared.delete')}
            onClick={() => onChange(nodes.filter((_, i) => i !== index))}
            disabled={disabled || nodes.length <= 1}
          >
            <Trash2 size={14} aria-hidden />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => onChange([...nodes, newNode(nodes.length)])}
        disabled={disabled}
      >
        <Plus size={14} aria-hidden />
        {t('editor.logicBranchAddNode')}
      </button>
    </>
  );
}
