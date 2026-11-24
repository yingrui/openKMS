import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { FormField } from '../../styles/design-system';
import {
  availableReferences,
  newNode,
  unknownReferences,
  type FlowDraft,
  type ModelNode,
} from './logicFlow';

export type ModelOption = { id: string; label: string; isDefault: boolean };

/**
 * The flow, as a vertical list of nodes rather than a canvas.
 *
 * Every existing flow editor draws boxes on a canvas; the flows people actually build are chains, and a chain reads
 * better as a list where the prompt is full width and the reference chips are next to the field. Branches (when they
 * exist) will indent under their condition instead of moving boxes around.
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
    onChange({ ...draft, nodes });
  };

  const remove = (index: number) => {
    if (draft.nodes.length <= 1) return;
    onChange({ ...draft, nodes: draft.nodes.filter((_, i) => i !== index) });
  };

  return (
    <div className="logic-flow">
      <ol className="logic-flow__nodes">
        {draft.nodes.map((node, index) => {
          const unknown = unknownReferences(node.prompt, index, draft.nodes);
          const references = availableReferences(index, draft.nodes);
          return (
            <li key={`${node.id}-${index}`} className="logic-flow__node">
              <div className="logic-flow__node-head">
                <input
                  className="logic-flow__id ds-control"
                  value={node.id}
                  aria-label={t('editor.logicNodeId')}
                  onChange={(e) => patch(index, { id: e.target.value })}
                  disabled={disabled}
                />
                <span className="logic-flow__kind">{t('editor.logicNodeModel')}</span>
                <select
                  className="ds-control logic-flow__model"
                  value={node.model_id}
                  aria-label={t('editor.logicNodeModel')}
                  onChange={(e) => patch(index, { model_id: e.target.value })}
                  disabled={disabled}
                >
                  <option value="">{t('editor.logicModelDefault')}</option>
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label}
                      {model.isDefault ? ` ${t('editor.logicModelDefaultTag')}` : ''}
                    </option>
                  ))}
                </select>
                <div className="logic-flow__node-actions">
                  <button
                    type="button"
                    className="ds-table-icon-link"
                    aria-label={t('editor.logicMoveUp')}
                    onClick={() => move(index, -1)}
                    disabled={disabled || index === 0}
                  >
                    <ArrowUp size={15} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="ds-table-icon-link"
                    aria-label={t('editor.logicMoveDown')}
                    onClick={() => move(index, 1)}
                    disabled={disabled || index === draft.nodes.length - 1}
                  >
                    <ArrowDown size={15} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="ds-table-icon-link"
                    aria-label={t('editor.logicRemoveNode')}
                    onClick={() => remove(index)}
                    disabled={disabled || draft.nodes.length <= 1}
                  >
                    <Trash2 size={15} aria-hidden />
                  </button>
                </div>
              </div>

              <FormField label={t('editor.logicSystem')} htmlFor={`logic-system-${index}`}>
                <input
                  id={`logic-system-${index}`}
                  className="ds-control"
                  value={node.system}
                  onChange={(e) => patch(index, { system: e.target.value })}
                  disabled={disabled}
                />
              </FormField>

              <FormField
                label={t('editor.logicPrompt')}
                htmlFor={`logic-prompt-${index}`}
                hint={
                  unknown.length
                    ? t('editor.logicUnknownRefs', { refs: unknown.join(', ') })
                    : t('editor.logicPromptHint', { refs: references.map((r) => `{{${r}}}`).join(' ') })
                }
              >
                <textarea
                  id={`logic-prompt-${index}`}
                  className="ds-control"
                  rows={4}
                  value={node.prompt}
                  onChange={(e) => patch(index, { prompt: e.target.value })}
                  disabled={disabled}
                />
              </FormField>

              <FormField
                label={t('editor.logicOutputSchema')}
                htmlFor={`logic-schema-${index}`}
                hint={t('editor.logicOutputSchemaHint')}
              >
                <textarea
                  id={`logic-schema-${index}`}
                  className="ds-control logic-flow__code"
                  rows={4}
                  spellCheck={false}
                  value={node.outputSchema}
                  onChange={(e) => patch(index, { outputSchema: e.target.value })}
                  disabled={disabled}
                />
              </FormField>

              <FormField label={t('editor.logicTokenLimit')} htmlFor={`logic-limit-${index}`}>
                <input
                  id={`logic-limit-${index}`}
                  className="ds-control logic-flow__limit"
                  type="number"
                  min={1}
                  value={node.tokenLimit}
                  onChange={(e) => patch(index, { tokenLimit: e.target.value })}
                  disabled={disabled}
                />
              </FormField>
            </li>
          );
        })}
      </ol>

      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => onChange({ ...draft, nodes: [...draft.nodes, newNode(draft.nodes.length)] })}
        disabled={disabled}
      >
        <Plus size={15} aria-hidden />
        {t('editor.logicAddNode')}
      </button>

      <FormField
        label={t('editor.logicOutputRef')}
        htmlFor="logic-output"
        hint={t('editor.logicOutputRefHint')}
      >
        <input
          id="logic-output"
          className="ds-control"
          value={draft.output}
          onChange={(e) => onChange({ ...draft, output: e.target.value })}
          disabled={disabled}
        />
      </FormField>

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
