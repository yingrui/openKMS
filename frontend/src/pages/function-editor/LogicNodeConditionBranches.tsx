import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { newNode, type BranchDraft, type ModelNode } from './logicFlow';

export function ConditionBranches({
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
  const patch = (index: number, changes: Partial<BranchDraft>) => {
    onChange({ branches: replaceAt(node.branches, index, changes) });
  };
  return (
    <div className="logic-node__params">
      <span className="logic-node__label">{t('editor.logicBranches')}</span>
      {node.branches.map((branch, index) => (
        <div key={index} className="logic-branch">
          <div className="logic-branch__head">
            <span className="logic-branch__label">{t('editor.logicBranch', { index: index + 1 })}</span>
            <input
              className="ds-control logic-branch__when"
              value={branch.when}
              placeholder={t('editor.logicBranchWhen', { refs: references.join(', ') })}
              aria-label={t('editor.logicBranchWhen', { refs: references.join(', ') })}
              onChange={(e) => patch(index, { when: e.target.value })}
              disabled={disabled}
            />
            <button
              type="button"
              className="ds-table-icon-link"
              aria-label={t('shared.delete')}
              onClick={() => onChange({ branches: node.branches.filter((_, i) => i !== index) })}
              disabled={disabled || node.branches.length <= 1}
            >
              <Trash2 size={14} aria-hidden />
            </button>
          </div>
          {branch.nodes.map((child, childIndex) => (
            <div key={childIndex} className="logic-branch__node">
              <select
                className="ds-control logic-node__tool-kind"
                value={child.kind}
                aria-label={t('editor.logicNodeKind')}
                onChange={(e) =>
                  patch(index, {
                    nodes: replaceAt(branch.nodes, childIndex, {
                      kind: e.target.value as 'model' | 'action',
                    }),
                  })
                }
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
                  onChange={(e) =>
                    patch(index, { nodes: replaceAt(branch.nodes, childIndex, { actionType: e.target.value }) })
                  }
                  disabled={disabled}
                />
              ) : (
                <textarea
                  className="ds-control logic-node__prompt logic-branch__prompt"
                  rows={2}
                  value={child.prompt}
                  placeholder={t('editor.logicPromptPlaceholder')}
                  aria-label={t('editor.logicPrompt')}
                  onChange={(e) =>
                    patch(index, { nodes: replaceAt(branch.nodes, childIndex, { prompt: e.target.value }) })
                  }
                  disabled={disabled}
                />
              )}
              <button
                type="button"
                className="ds-table-icon-link"
                aria-label={t('shared.delete')}
                onClick={() => patch(index, { nodes: branch.nodes.filter((_, i) => i !== childIndex) })}
                disabled={disabled || branch.nodes.length <= 1}
              >
                <Trash2 size={14} aria-hidden />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => patch(index, { nodes: [...branch.nodes, newNode(branch.nodes.length)] })}
            disabled={disabled}
          >
            <Plus size={14} aria-hidden />
            {t('editor.logicBranchAddNode')}
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() =>
          onChange({
            branches: [...node.branches, { when: '', nodes: [newNode(0)] }],
          })
        }
        disabled={disabled}
      >
        <Plus size={14} aria-hidden />
        {t('editor.logicAddBranch')}
      </button>
      <p className="logic-node__hint">{t('editor.logicBranchesHint')}</p>
    </div>
  );
}


function replaceAt<T>(rows: T[], index: number, patch: Partial<T>): T[] {
  return rows.map((row, i) => (i === index ? { ...row, ...patch } : row));
}
