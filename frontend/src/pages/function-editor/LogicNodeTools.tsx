import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { newTool, type ModelNode, type NodeTool } from './logicFlow';

function replaceAt<T>(rows: T[], index: number, patch: Partial<T>): T[] {
  return rows.map((row, i) => (i === index ? { ...row, ...patch } : row));
}

/**
 * The tools a node may use. One row per tool, and the row's shape follows the kind: a tool with nothing to configure
 * says so rather than showing empty inputs.
 */
export function LogicNodeTools({
  node,
  objectTypes,
  disabled,
  onChange,
}: {
  node: ModelNode;
  objectTypes: string[];
  disabled: boolean;
  onChange: (changes: Partial<ModelNode>) => void;
}) {
  const { t } = useTranslation('ontology');
  return (
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
                      tools: replaceAt(node.tools, toolIndex, newTool(e.target.value as NodeTool['kind'])),
                    })
                  }
                  disabled={disabled}
                >
                  <option value="query_objects">{t('editor.logicToolQuery')}</option>
                  <option value="call_function">{t('editor.logicToolCall')}</option>
                  <option value="apply_action">{t('editor.logicToolApply')}</option>
                  <option value="calculator">{t('editor.logicToolCalculator')}</option>
                </select>

                {tool.kind === 'apply_action' ? (
                  <>
                    <input
                      className="ds-control logic-node__tool-props"
                      value={tool.actionType}
                      placeholder={t('editor.logicToolActionType')}
                      aria-label={t('editor.logicToolActionType')}
                      onChange={(e) =>
                        onChange({ tools: replaceAt(node.tools, toolIndex, { actionType: e.target.value }) })
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
                ) : null}

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
                ) : tool.kind === 'calculator' ? (
                  <span className="logic-node__tool-note">{t('editor.logicToolCalculatorNote')}</span>
                ) : tool.kind === 'call_function' ? (
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
                ) : null}

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
  );
}
