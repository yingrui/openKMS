import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { newNode, type BranchDraft, type ModelNode } from './logicFlow';
import { NestedNodeList } from './LogicNodeNestedList';

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
          <NestedNodeList
            nodes={branch.nodes}
            disabled={disabled}
            onChange={(nodes) => patch(index, { nodes })}
          />
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
