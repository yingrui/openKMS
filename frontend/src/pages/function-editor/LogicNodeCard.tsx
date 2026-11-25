import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import {
  FIELD_TYPES,
  availableReferences,
  unknownReferences,
  type FieldType,
  type ModelNode,
  type NodeKind,
  type NodeTool,
  type OutputField,
} from './logicFlow';
import { ActionParams } from './LogicNodeActionParams';
import { ConditionBranches } from './LogicNodeConditionBranches';
import { LoopBody } from './LogicNodeLoopBody';
import { NodeRunValue } from './LogicNodeResult';

/**
 * One node, shaped like the thing people are actually writing: a prompt.
 *
 * Everything else is either derived (the node id, the input schema, the reference list) or secondary (system prompt,
 * token limit), which is why the reference chips sit under the prompt and the rest lives behind “Advanced”. The first
 * version of this form presented six equal fields per node and asked the author to type JSON — technically complete,
 * unusable in practice.
 */
export function LogicNodeCard({
  node,
  models,
  index,
  nodes,
  fields,
  objectTypes,
  runValue,
  disabled,
  onChange,
  onMove,
  onRemove,
  canRemove,
}: {
  node: ModelNode;
  models: { id: string; label: string; isDefault: boolean }[];
  index: number;
  nodes: ModelNode[];
  fields: OutputField[];
  /** Object type api names the tool may read — the flow's tool configuration chooses from these. */
  objectTypes: string[];
  /** What this node returned in the last run — shown here, so the flow reads as data moving through it. */
  runValue?: { output?: unknown; error?: string; tokens?: number; ms?: number } | null;
  disabled: boolean;
  onChange: (changes: Partial<ModelNode>) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const { t } = useTranslation('ontology');
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const references = availableReferences(index, nodes);
  const unknown = unknownReferences(node.prompt, index, nodes);
  const structured = node.outputMode === 'fields';

  /** Insert `{{ref}}` where the caret is — the prompt stays the source of truth for what the node needs. */
  const insert = (reference: string) => {
    const token = `{{${reference}}}`;
    const element = promptRef.current;
    if (!element) {
      onChange({ prompt: `${node.prompt}${token}` });
      return;
    }
    const start = element.selectionStart ?? node.prompt.length;
    const end = element.selectionEnd ?? node.prompt.length;
    const next = `${node.prompt.slice(0, start)}${token}${node.prompt.slice(end)}`;
    onChange({ prompt: next });
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(start + token.length, start + token.length);
    });
  };

  return (
    <li className={`logic-node${index === 0 ? ' logic-node--first' : ''}`}>
      <div className="logic-node__head">
        <span className="logic-node__index">{t('editor.logicNodeLabel', { index: index + 1 })}</span>
        <code className="logic-node__id">{node.id || '—'}</code>
        <span className="logic-node__type">
          {node.kind === 'action'
            ? t('editor.logicTypeEdits')
            : node.kind === 'condition'
              ? t('editor.logicTypeBranch')
              : node.kind === 'loop'
                ? t('editor.logicTypeLoop')
                : node.kind === 'transform'
                  ? t('editor.logicTypeTransform')
              : structured
              ? t('editor.logicTypeFields', { count: fields.length })
              : t('editor.logicTypeText')}
        </span>
        {index > 0 ? (
          <span className="logic-node__flow">
            {t('editor.logicNodeUses', {
              refs: availableReferences(index, nodes)
                .filter((ref) => ref !== 'input')
                .join(' '),
            })}
          </span>
        ) : null}
        <div className="logic-node__actions">
          <button
            type="button"
            className="ds-table-icon-link"
            aria-label={t('editor.logicMoveUp')}
            onClick={() => onMove(-1)}
            disabled={disabled || index === 0}
          >
            ↑
          </button>
          <button
            type="button"
            className="ds-table-icon-link"
            aria-label={t('editor.logicMoveDown')}
            onClick={() => onMove(1)}
            disabled={disabled || index === nodes.length - 1}
          >
            ↓
          </button>
          <button
            type="button"
            className="ds-table-icon-link"
            aria-label={t('editor.logicRemoveNode')}
            onClick={onRemove}
            disabled={disabled || !canRemove}
          >
            <Trash2 size={14} aria-hidden />
          </button>
        </div>
      </div>

      <div className="logic-node__row">
        <label className="logic-node__label" htmlFor={`logic-kind-${index}`}>
          {t('editor.logicNodeKind')}
        </label>
        <select
          id={`logic-kind-${index}`}
          className="ds-control logic-node__mode"
          value={node.kind}
          onChange={(e) => onChange({ kind: e.target.value as NodeKind })}
          disabled={disabled}
        >
          <option value="model">{t('editor.logicNodeKindModel')}</option>
          <option value="action">{t('editor.logicNodeKindAction')}</option>
          <option value="transform">{t('editor.logicNodeKindTransform')}</option>
          <option value="condition">{t('editor.logicNodeKindCondition')}</option>
          <option value="loop">{t('editor.logicNodeKindLoop')}</option>
        </select>
        {node.kind === 'action' ? (
          <input
            className="ds-control logic-node__action-type"
            value={node.actionType}
            placeholder={t('editor.logicActionType')}
            aria-label={t('editor.logicActionType')}
            onChange={(e) => onChange({ actionType: e.target.value })}
            disabled={disabled}
          />
        ) : null}
      </div>

      {node.kind === 'action' ? (
        <ActionParams node={node} references={references} disabled={disabled} onChange={onChange} />
      ) : null}

      {node.kind === 'transform' ? (
        <ActionParams node={node} references={references} disabled={disabled} onChange={onChange} />
      ) : null}

      {node.kind === 'condition' ? (
        <ConditionBranches node={node} references={references} disabled={disabled} onChange={onChange} />
      ) : null}

      {node.kind === 'loop' ? (
        <LoopBody node={node} references={references} disabled={disabled} onChange={onChange} />
      ) : null}

      {node.kind === 'model' ? (
      <>
      <label className="logic-node__label" htmlFor={`logic-prompt-${index}`}>
        {t('editor.logicPrompt')}
      </label>
      <textarea
        id={`logic-prompt-${index}`}
        ref={promptRef}
        className="ds-control logic-node__prompt"
        rows={5}
        value={node.prompt}
        placeholder={t('editor.logicPromptPlaceholder')}
        onChange={(e) => onChange({ prompt: e.target.value })}
        disabled={disabled}
      />

      <div className="logic-node__refs">
        <span className="logic-node__refs-label">{t('editor.logicInsert')}</span>
        {references.map((reference) => (
          <button
            key={reference}
            type="button"
            className="logic-node__chip"
            onClick={() => insert(reference === 'input' ? 'input.email' : `${reference}`)}
            disabled={disabled}
            title={reference === 'input' ? t('editor.logicChipInputHint') : undefined}
          >
            {reference === 'input' ? t('editor.logicChipInput') : `{{${reference}}}`}
          </button>
        ))}
        {unknown.length ? (
          <span className="logic-node__refs-warn">
            {t('editor.logicUnknownRefs', { refs: unknown.join(', ') })}
          </span>
        ) : null}
      </div>

      <div className="logic-node__row">
        <label className="logic-node__label" htmlFor={`logic-output-mode-${index}`}>
          {t('editor.logicOutput')}
        </label>
        <select
          id={`logic-output-mode-${index}`}
          className="ds-control logic-node__mode"
          value={node.outputMode}
          onChange={(e) => onChange({ outputMode: e.target.value as ModelNode['outputMode'] })}
          disabled={disabled}
        >
          <option value="text">{t('editor.logicOutputText')}</option>
          <option value="fields">{t('editor.logicOutputFields')}</option>
        </select>
        <select
          className="ds-control logic-node__model-select"
          value={node.model_id}
          aria-label={t('editor.logicNodeModel')}
          onChange={(e) => onChange({ model_id: e.target.value })}
          disabled={disabled}
        >
          <option value="">{t('editor.logicModelDefault')}</option>
          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.label}
            </option>
          ))}
        </select>
      </div>

      {structured ? (
        <div className="logic-node__fields">
          {fields.length === 0 ? (
            <p className="logic-node__hint">{t('editor.logicFieldsEmpty')}</p>
          ) : (
            <table className="ds-table logic-node__fields-table">
              <thead>
                <tr>
                  <th>{t('editor.logicFieldName')}</th>
                  <th>{t('editor.logicFieldType')}</th>
                  <th>{t('editor.logicFieldDescription')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {fields.map((field, fieldIndex) => (
                  <tr key={`${field.name}-${fieldIndex}`}>
                    <td>
                      <input
                        className="ds-control"
                        value={field.name}
                        onChange={(e) => onChange({ fields: replaceAt(fields, fieldIndex, { name: e.target.value }) })}
                        disabled={disabled}
                      />
                    </td>
                    <td>
                      <select
                        className="ds-control"
                        value={field.type}
                        onChange={(e) =>
                          onChange({
                            fields: replaceAt(fields, fieldIndex, { type: e.target.value as FieldType }),
                          })
                        }
                        disabled={disabled}
                      >
                        {FIELD_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        className="ds-control"
                        value={field.description}
                        onChange={(e) =>
                          onChange({ fields: replaceAt(fields, fieldIndex, { description: e.target.value }) })
                        }
                        disabled={disabled}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="ds-table-icon-link"
                        aria-label={t('shared.delete')}
                        onClick={() => onChange({ fields: fields.filter((_, i) => i !== fieldIndex) })}
                        disabled={disabled}
                      >
                        <Trash2 size={14} aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onChange({ fields: [...fields, { name: '', type: 'string', description: '' }] })}
            disabled={disabled}
          >
            <Plus size={14} aria-hidden />
            {t('editor.logicAddField')}
          </button>
        </div>
      ) : null}

      <div className="logic-node__tools">
        <div className="logic-node__tools-head">
          <span className="logic-node__label">{t('editor.logicTools')}</span>
          <span className="logic-node__hint">{t('editor.logicToolsHint')}</span>
        </div>
        {node.tools.map((tool, toolIndex) => (
          <div key={tool.id} className="logic-node__tool">
            <select
              className="ds-control logic-node__tool-kind"
              value={tool.kind}
              aria-label={t('editor.logicToolKind')}
              onChange={(e) =>
                onChange({
                  tools: replaceAt(node.tools, toolIndex, newTool(e.target.value as 'query_objects' | 'call_function')),
                })
              }
              disabled={disabled}
            >
              <option value="query_objects">{t('editor.logicToolQuery')}</option>
              <option value="call_function">{t('editor.logicToolCall')}</option>
            </select>

            {tool.kind === 'query_objects' ? (
              <>
                <select
                  className="ds-control logic-node__tool-type"
                  value={tool.object_type}
                  aria-label={t('editor.logicToolObjectType')}
                  onChange={(e) =>
                    onChange({ tools: replaceAt(node.tools, toolIndex, { object_type: e.target.value }) })
                  }
                  disabled={disabled}
                >
                  <option value="">{t('editor.logicToolPickType')}</option>
                  {objectTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                  {/* A saved flow may name a type that no longer exists; keep it selectable so it stays visible. */}
                  {tool.object_type && !objectTypes.includes(tool.object_type) ? (
                    <option value={tool.object_type}>{tool.object_type}</option>
                  ) : null}
                </select>
                <input
                  className="ds-control logic-node__tool-props"
                  value={tool.properties.join(', ')}
                  placeholder={t('editor.logicToolProperties')}
                  aria-label={t('editor.logicToolProperties')}
                  onChange={(e) =>
                    onChange({
                      tools: replaceAt(node.tools, toolIndex, {
                        properties: e.target.value.split(',').map((prop) => prop.trim()),
                      }),
                    })
                  }
                  disabled={disabled}
                />
                <input
                  className="ds-control logic-node__tool-limit"
                  type="number"
                  min={1}
                  max={25}
                  value={tool.limit}
                  aria-label={t('editor.logicToolLimit')}
                  onChange={(e) =>
                    onChange({
                      tools: replaceAt(node.tools, toolIndex, { limit: Number(e.target.value) || 1 }),
                    })
                  }
                  disabled={disabled}
                />
              </>
            ) : (
              <>
                <input
                  className="ds-control logic-node__tool-props"
                  value={tool.function}
                  placeholder={t('editor.logicToolFunction')}
                  aria-label={t('editor.logicToolFunction')}
                  onChange={(e) =>
                    onChange({ tools: replaceAt(node.tools, toolIndex, { function: e.target.value }) })
                  }
                  disabled={disabled}
                />
                <input
                  className="ds-control logic-node__tool-desc"
                  value={tool.description}
                  placeholder={t('editor.logicToolWhen')}
                  aria-label={t('editor.logicToolWhen')}
                  onChange={(e) =>
                    onChange({ tools: replaceAt(node.tools, toolIndex, { description: e.target.value }) })
                  }
                  disabled={disabled}
                />
              </>
            )}

            <button
              type="button"
              className="ds-table-icon-link"
              aria-label={t('shared.delete')}
              onClick={() => onChange({ tools: node.tools.filter((_, i) => i !== toolIndex) })}
              disabled={disabled}
            >
              <Trash2 size={14} aria-hidden />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() =>
            onChange({
              tools: [...node.tools, newTool('query_objects')],
            })
          }
          disabled={disabled}
        >
          <Plus size={14} aria-hidden />
          {t('editor.logicAddTool')}
        </button>
      </div>

      </>
      ) : null}

      {runValue ? <NodeRunValue value={runValue} /> : null}

      <details className="logic-node__advanced">
        <summary>
          <ChevronRight size={14} aria-hidden className="logic-node__chevron" />
          <ChevronDown size={14} aria-hidden className="logic-node__chevron-open" />
          {t('editor.logicAdvanced')}
        </summary>
        <div className="logic-node__advanced-body">
          <label className="logic-node__label" htmlFor={`logic-system-${index}`}>
            {t('editor.logicSystem')}
          </label>
          <input
            id={`logic-system-${index}`}
            className="ds-control"
            value={node.system}
            onChange={(e) => onChange({ system: e.target.value })}
            disabled={disabled}
          />
          <div className="logic-node__row">
            <label className="logic-node__label" htmlFor={`logic-limit-${index}`}>
              {t('editor.logicTokenLimit')}
            </label>
            <input
              id={`logic-limit-${index}`}
              className="ds-control logic-node__limit"
              type="number"
              min={1}
              value={node.tokenLimit}
              onChange={(e) => onChange({ tokenLimit: e.target.value })}
              disabled={disabled}
            />
            <label className="logic-node__label" htmlFor={`logic-id-${index}`}>
              {t('editor.logicNodeId')}
            </label>
            <input
              id={`logic-id-${index}`}
              className="ds-control logic-node__id-input"
              value={node.id}
              onChange={(e) => onChange({ id: e.target.value })}
              disabled={disabled}
            />
          </div>
          <label className="logic-node__label" htmlFor={`logic-schema-${index}`}>
            {t('editor.logicOutputSchemaRaw')}
          </label>
          <textarea
            id={`logic-schema-${index}`}
            className="ds-control logic-node__prompt logic-node__code"
            rows={3}
            spellCheck={false}
            value={node.outputSchema}
            placeholder={t('editor.logicOutputSchemaHint')}
            onChange={(e) => onChange({ outputSchema: e.target.value })}
            disabled={disabled}
          />
        </div>
      </details>
    </li>
  );
}

/** A node's answer, rendered as fields rather than a JSON blob — the point of a structured output. */
/** Ordered branches: a `when` template and a body of nested nodes; the empty `when` is the fallback. */
/** Action parameters: key + template. Editing vs the spec is one row each, in order. */
function newTool(kind: 'query_objects' | 'call_function'): NodeTool {
  return kind === 'call_function'
    ? { id: `tool-${Date.now()}`, kind, function: '', description: '' }
    : { id: `tool-${Date.now()}`, kind, object_type: '', properties: [], limit: 5 };
}

function replaceAt<T>(rows: T[], index: number, patch: Partial<T>): T[] {
  return rows.map((row, i) => (i === index ? { ...row, ...patch } : row));
}
