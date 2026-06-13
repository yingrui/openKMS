import { ChevronRight, Folder, FolderOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ChannelNode } from '../../data/channelsApi';

export function DocPickerChannelTree({
  node,
  selectedId,
  expanded,
  onSelect,
  onToggle,
  depth,
}: {
  node: ChannelNode;
  selectedId: string | null;
  expanded: Record<string, boolean>;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  depth: number;
}) {
  const { t } = useTranslation('knowledgeBase');
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expanded[node.id];
  return (
    <li className="kb-doc-picker-channel-li">
      <div
        className={`kb-doc-picker-channel-item${selectedId === node.id ? ' selected' : ''}`}
        style={{ paddingLeft: 8 + depth * 16 }}
      >
        {hasChildren ? (
          <button
            type="button"
            className="kb-doc-picker-channel-toggle"
            onClick={() => onToggle(node.id)}
            aria-label={isExpanded ? t('detail.collapseTree') : t('detail.expandTree')}
          >
            <ChevronRight size={14} className={isExpanded ? 'expanded' : ''} />
          </button>
        ) : (
          <span className="kb-doc-picker-channel-spacer" />
        )}
        <button
          type="button"
          className="kb-doc-picker-channel-label"
          onClick={() => onSelect(node.id)}
        >
          {hasChildren && isExpanded ? (
            <FolderOpen size={16} />
          ) : (
            <Folder size={16} />
          )}
          <span>{node.name}</span>
        </button>
      </div>
      {hasChildren && isExpanded && (
        <ul className="kb-doc-picker-channel-tree kb-doc-picker-channel-tree--root">
          {node.children!.map((ch) => (
            <DocPickerChannelTree
              key={ch.id}
              node={ch}
              selectedId={selectedId}
              expanded={expanded}
              onSelect={onSelect}
              onToggle={onToggle}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
