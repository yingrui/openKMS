import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { LogicNodeCard } from './LogicNodeCard';
import { newNode, type FlowDraft, type ModelNode } from './logicFlow';

export type ModelOption = { id: string; label: string; isDefault: boolean };

/**
 * The flow, as a stack of prompt cards.
 *
 * Flows in practice are chains, so the chain is the layout: each node is a card you read top to bottom, and a branch
 * (when branches exist) will indent under its condition rather than becoming a box on a canvas. What the card does not
 * show, it derives — ids, input schema, reference list — because those were the parts people had to type twice.
 */
export function LogicFlowEditor({
  draft,
  models,
  errors,
  disabled,
  onChange,
}: {
  draft: FlowDraft;
  models: ModelOption[];
  errors: string[];
  disabled: boolean;
  onChange: (next: FlowDraft) => void;
}) {
  const { t } = useTranslation('ontology');

  const patch = (index: number, changes: Partial<ModelNode>) => {
    onChange({
      ...draft,
      nodes: draft.nodes.map((node, i) => (i === index ? { ...node, ...changes } : node)),
    });
  };

  const move = (index: number, by: -1 | 1) => {
    const target = index + by;
    if (target < 0 || target >= draft.nodes.length) return;
    const nodes = [...draft.nodes];
    [nodes[index], nodes[target]] = [nodes[target], nodes[index]];
    onChange({ nodes });
  };

  const remove = (index: number) => {
    if (draft.nodes.length <= 1) return;
    onChange({ nodes: draft.nodes.filter((_, i) => i !== index) });
  };

  const add = () => onChange({ nodes: [...draft.nodes, newNode(draft.nodes.length)] });

  return (
    <div className="logic-flow">
      <ol className="logic-flow__nodes">
        {draft.nodes.map((node, index) => (
          <LogicNodeCard
            key={index}
            node={node}
            models={models}
            index={index}
            nodes={draft.nodes}
            fields={node.fields}
            disabled={disabled}
            onChange={(changes) => patch(index, changes)}
            onMove={(by) => move(index, by)}
            onRemove={() => remove(index)}
            canRemove={draft.nodes.length > 1}
          />
        ))}
      </ol>

      <button type="button" className="logic-flow__add" onClick={add} disabled={disabled}>
        <Plus size={15} aria-hidden />
        {t('editor.logicAddNode')}
      </button>

      {errors.length ? (
        <ul className="logic-flow__errors" role="alert">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
