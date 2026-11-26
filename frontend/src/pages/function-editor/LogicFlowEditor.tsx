import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { LogicInputsBoard } from './LogicInputsBoard';
import { LogicNodeCard } from './LogicNodeCard';
import {
  newNode,
  syncInputs,
  unusedInputs,
  type FlowDraft,
  type ModelNode,
} from './logicFlow';

export type ModelOption = { id: string; label: string; isDefault: boolean };

export type NodeRunValue = { output?: unknown; error?: string; tokens?: number; ms?: number };

/**
 * Inputs at the top, then the chain of prompt cards, then which card answers.
 *
 * That is the shape AIP Logic puts on screen (inputs board → blocks → output), and the reason it works is that each
 * part is visible as itself: inputs are typed rows, a block shows the shape and the value it produced, and the output
 * is picked from what exists instead of typed as a reference.
 */
export function LogicFlowEditor({
  draft,
  models,
  errors,
  runValues,
  objectTypes,
  objectProperties,
  disabled,
  onChange,
}: {
  draft: FlowDraft;
  models: ModelOption[];
  errors: string[];
  /** Last run, keyed by node id — the value each card produced. */
  runValues: Record<string, NodeRunValue>;
  /** Object types a query tool may read (api names). */
  objectTypes: string[];
  /** api_name → property names, so a prompt can insert a real field of an object input. */
  objectProperties: Record<string, string[]>;

  disabled: boolean;
  onChange: (next: FlowDraft) => void;
}) {
  const { t } = useTranslation('ontology');

  /** Every edit re-syncs the input board, so a new `{{input.x}}` shows up as a row without a second step. */
  const update = (next: FlowDraft) => onChange(syncInputs(next));

  const patch = (index: number, changes: Partial<ModelNode>) => {
    update({
      ...draft,
      nodes: draft.nodes.map((node, i) => (i === index ? { ...node, ...changes } : node)),
    });
  };

  const move = (index: number, by: -1 | 1) => {
    const target = index + by;
    if (target < 0 || target >= draft.nodes.length) return;
    const nodes = [...draft.nodes];
    [nodes[index], nodes[target]] = [nodes[target], nodes[index]];
    update({ ...draft, nodes });
  };

  const remove = (index: number) => {
    if (draft.nodes.length <= 1) return;
    update({ ...draft, nodes: draft.nodes.filter((_, i) => i !== index) });
  };

  return (
    <div className="logic-flow">
      <LogicInputsBoard
        draft={draft}
        unused={unusedInputs(draft)}
        objectTypes={objectTypes}
        disabled={disabled}
        onChange={update}
      />

      <ol className="logic-flow__nodes">
        {draft.nodes.map((node, index) => (
          <LogicNodeCard
            key={index}
            node={node}
            models={models}
            index={index}
            nodes={draft.nodes}
            fields={node.fields}
            objectTypes={objectTypes}
            objectProperties={objectProperties}
            isAnswer={
              draft.output
                ? node.id.trim() === draft.output
                : index === draft.nodes.length - 1
            }
            onToggleAnswer={() =>
              update({
                ...draft,
                // Marking the node that is already the default keeps the spec free of a redundant reference.
                output:
                  node.id.trim() === draft.output || index === draft.nodes.length - 1
                    ? ''
                    : node.id.trim(),
              })
            }
            objectInputs={draft.inputs.filter(
              (field) => field.type === 'object' || field.type === 'object_set',
            )}
            runValue={runValues[node.id]}
            disabled={disabled}
            onChange={(changes) => patch(index, changes)}
            onMove={(by) => move(index, by)}
            onRemove={() => remove(index)}
            canRemove={draft.nodes.length > 1}
          />
        ))}
      </ol>

      <button
        type="button"
        className="logic-flow__add"
        onClick={() => update({ ...draft, nodes: [...draft.nodes, newNode(draft.nodes.length)] })}
        disabled={disabled}
      >
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
