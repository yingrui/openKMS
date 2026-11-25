import { useTranslation } from 'react-i18next';
import type { ModelNode } from './logicFlow';
import { NestedNodeList } from './LogicNodeNestedList';

/**
 * A loop: what to iterate, what to call each element, and what to do per element.
 *
 * The element name is a promise: `{{item.x}}` works inside the body and nowhere else, which is why it is a field here
 * rather than something derived from the list's contents.
 */
export function LoopBody({
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
      <div className="logic-node__row">
        <label className="logic-node__label" htmlFor="logic-loop-over">
          {t('editor.logicLoopOver')}
        </label>
        <input
          id="logic-loop-over"
          className="ds-control logic-node__param-value"
          value={node.over}
          placeholder={`{{${references.join('.items}}  {{')}.items}}`}
          onChange={(e) => onChange({ over: e.target.value })}
          disabled={disabled}
        />
        <label className="logic-node__label" htmlFor="logic-loop-as">
          {t('editor.logicLoopAs')}
        </label>
        <input
          id="logic-loop-as"
          className="ds-control logic-node__param-key"
          value={node.elementName}
          onChange={(e) => onChange({ elementName: e.target.value })}
          disabled={disabled}
        />
        <label className="logic-node__label" htmlFor="logic-loop-concurrency">
          {t('editor.logicLoopConcurrency')}
        </label>
        <input
          id="logic-loop-concurrency"
          className="ds-control logic-node__tool-limit"
          type="number"
          min={1}
          value={node.concurrency}
          onChange={(e) => onChange({ concurrency: e.target.value })}
          disabled={disabled}
        />
      </div>
      <span className="logic-node__label">{t('editor.logicLoopBody')}</span>
      <NestedNodeList
        nodes={node.loopNodes}
        disabled={disabled}
        onChange={(loopNodes) => onChange({ loopNodes })}
      />
      <p className="logic-node__hint">
        {t('editor.logicLoopHint', { element: node.elementName || 'item' })}
      </p>
    </div>
  );
}
