import { ChevronRight, Folder, FolderOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ChannelNode } from '../../data/channelUtils';
import './ChannelTree.scss';

type Props = {
  channels: ChannelNode[];
  selectedId: string | null;
  expanded: Record<string, boolean>;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  depth?: number;
};

export function ChannelTree({
  channels,
  selectedId,
  expanded,
  onSelect,
  onToggle,
  depth = 0,
}: Props) {
  const { t } = useTranslation('layout');

  return (
    <ul className="channel-tree" style={{ paddingLeft: depth > 0 ? 8 : 0 }}>
      {channels.map((ch) => (
        <li key={ch.id}>
          <div className={`channel-tree-item ${selectedId === ch.id ? 'channel-tree-item--selected' : ''}`}>
            {ch.children && ch.children.length > 0 ? (
              <button
                type="button"
                className="channel-tree-toggle"
                onClick={() => onToggle(ch.id)}
                aria-label={expanded[ch.id] ? t('collapseTree') : t('expandTree')}
              >
                <ChevronRight size={12} className={expanded[ch.id] ? 'channel-tree-toggle-icon--expanded' : ''} />
              </button>
            ) : (
              <span className="channel-tree-spacer" />
            )}
            <button type="button" className="channel-tree-label" onClick={() => onSelect(ch.id)}>
              {ch.children && expanded[ch.id] ? <FolderOpen size={14} /> : <Folder size={14} />}
              <span>{ch.name}</span>
            </button>
          </div>
          {ch.children && expanded[ch.id] ? (
            <ChannelTree
              channels={ch.children}
              selectedId={selectedId}
              expanded={expanded}
              onSelect={onSelect}
              onToggle={onToggle}
              depth={depth + 1}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
