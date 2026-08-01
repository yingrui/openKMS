import { Check, ChevronLeft, ChevronRight, FileText, Loader2, Plus, Search as SearchIcon, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ChannelNode } from '../../data/channelsApi';
import type { DocumentListItemResponse } from '../../data/documentsApi';
import type { WikiSpaceResponse } from '../../data/wikiSpacesApi';
import type { KBWikiSpaceResponse } from '../../data/knowledgeBasesApi';
import { DocPickerChannelTree } from './KnowledgeBaseDetail.docPickerTree';

export interface KbDocPickerDialogProps {
  show: boolean;
  onClose: () => void;
  pickerAdding: boolean;
  channels: ChannelNode[];
  pickerSelectedChannel: string | null;
  pickerChannelExpanded: Record<string, boolean>;
  onPickerChannelSelect: (channelId: string) => void;
  onPickerChannelToggle: (channelId: string) => void;
  pickerSearch: string;
  onPickerSearch: (query: string) => void;
  pickerLoading: boolean;
  pickerResults: DocumentListItemResponse[];
  alreadyAddedIds: Set<string>;
  pickerSelected: Set<string>;
  onTogglePickerDoc: (docId: string) => void;
  pickerTotal: number;
  pickerPage: number;
  pickerPageSize: number;
  onPickerPageChange: (updater: (p: number) => number) => void;
  pickerCanPrev: boolean;
  pickerCanNext: boolean;
  pickerTotalPages: number;
  onAddSelectedDocuments: () => void;
}

export function KbDocPickerDialog({
  show,
  onClose,
  pickerAdding,
  channels,
  pickerSelectedChannel,
  pickerChannelExpanded,
  onPickerChannelSelect,
  onPickerChannelToggle,
  pickerSearch,
  onPickerSearch,
  pickerLoading,
  pickerResults,
  alreadyAddedIds,
  pickerSelected,
  onTogglePickerDoc,
  pickerTotal,
  pickerPage,
  pickerPageSize,
  onPickerPageChange,
  pickerCanPrev,
  pickerCanNext,
  pickerTotalPages,
  onAddSelectedDocuments,
}: KbDocPickerDialogProps) {
  const { t } = useTranslation('knowledgeBase');
  if (!show) return null;

  return (
    <div
      className="kb-doc-picker-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="doc-picker-title"
    >
      <div className="kb-doc-picker kb-doc-picker-split" onClick={(e) => e.stopPropagation()}>
        <div className="kb-doc-picker-header">
          <h2 id="doc-picker-title">{t('detail.docPickerTitle')}</h2>
          <button
            type="button"
            className="kb-doc-picker-close"
            onClick={onClose}
            disabled={pickerAdding}
            aria-label={t('detail.closeAria')}
          >
            <X size={20} />
          </button>
        </div>
        <div className="kb-doc-picker-body">
          <aside className="kb-doc-picker-sidebar">
            <span className="kb-doc-picker-sidebar-label">{t('detail.channels')}</span>
            <ul className="kb-doc-picker-channel-tree">
              {channels.length === 0 ? (
                <li className="kb-doc-picker-channel-empty">{t('detail.noChannels')}</li>
              ) : (
                <>
                  {channels.map((ch) => (
                    <DocPickerChannelTree
                      key={ch.id}
                      node={ch}
                      selectedId={pickerSelectedChannel}
                      expanded={pickerChannelExpanded}
                      onSelect={onPickerChannelSelect}
                      onToggle={onPickerChannelToggle}
                      depth={0}
                    />
                  ))}
                </>
              )}
            </ul>
          </aside>
          <div className="kb-doc-picker-main">
            <div className="kb-doc-picker-search">
              <SearchIcon size={18} />
              <input
                type="search"
                placeholder={t('detail.searchDocsPlaceholder')}
                value={pickerSearch}
                onChange={(e) => onPickerSearch(e.target.value)}
                disabled={!pickerSelectedChannel}
                autoFocus
              />
            </div>
            <div className="kb-doc-picker-list">
              {!pickerSelectedChannel ? (
                <div className="kb-doc-picker-empty">
                  <p>{t('detail.selectChannelFirst')}</p>
                </div>
              ) : pickerLoading ? (
                <div className="kb-doc-picker-loading">
                  <Loader2 size={24} className="kb-doc-picker-spinner" />
                  <span>{t('detail.loadingDocs')}</span>
                </div>
              ) : pickerResults.length === 0 ? (
                <div className="kb-doc-picker-empty">
                  <p>{t('detail.noDocsFound')}</p>
                </div>
              ) : (
                pickerResults.map((doc) => {
                  const added = alreadyAddedIds.has(doc.id);
                  const selected = pickerSelected.has(doc.id);
                  return (
                    <div
                      key={doc.id}
                      className={`kb-doc-picker-item${selected ? ' selected' : ''}${added ? ' already-added' : ''}`}
                      onClick={() => !added && onTogglePickerDoc(doc.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && !added && onTogglePickerDoc(doc.id)}
                    >
                      <div className="kb-doc-picker-item-check">
                        {added ? (
                          <Check size={16} />
                        ) : selected ? (
                          <Check size={16} />
                        ) : (
                          <div className="kb-doc-picker-item-checkbox" />
                        )}
                      </div>
                      <FileText size={18} className="kb-doc-picker-item-icon" />
                      <div className="kb-doc-picker-item-info">
                        <span className="kb-doc-picker-item-name">{doc.name}</span>
                        <span className="kb-doc-picker-item-meta">
                          {doc.file_type} · {doc.status || 'completed'}
                        </span>
                      </div>
                      {added && <span className="kb-doc-picker-item-badge">{t('detail.addedBadge')}</span>}
                    </div>
                  );
                })
              )}
            </div>
            {pickerSelectedChannel && pickerTotal > 0 && (
              <div className="kb-doc-picker-pagination">
                <span className="kb-doc-picker-pagination-info">
                  {t('detail.pickerPageRange', {
                    start: pickerPage * pickerPageSize + 1,
                    end: Math.min((pickerPage + 1) * pickerPageSize, pickerTotal),
                    total: pickerTotal,
                  })}
                </span>
                <div className="kb-doc-picker-pagination-btns">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => onPickerPageChange((p) => Math.max(0, p - 1))}
                    disabled={!pickerCanPrev}
                    aria-label={t('detail.pickerAriaPrevPage')}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => onPickerPageChange((p) => Math.min(pickerTotalPages - 1, p + 1))}
                    disabled={!pickerCanNext}
                    aria-label={t('detail.pickerAriaNextPage')}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="kb-doc-picker-footer">
          <span className="kb-doc-picker-count">
            {pickerSelected.size > 0
              ? t('detail.pickerSelected', { count: pickerSelected.size })
              : t('detail.pickerNoneSelected')}
          </span>
          <div className="kb-doc-picker-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={pickerAdding}
            >
              {t('detail.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={onAddSelectedDocuments}
              disabled={pickerSelected.size === 0 || pickerAdding}
            >
              {pickerAdding ? (
                <>
                  <Loader2 size={18} className="kb-doc-picker-spinner" />
                  <span>{t('detail.adding')}</span>
                </>
              ) : (
                <>
                  <Plus size={18} />
                  <span>
                    {pickerSelected.size > 0
                      ? t('detail.addButtonWithCount', { count: pickerSelected.size })
                      : t('detail.addButton')}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export interface KbWikiSpacePickerDialogProps {
  show: boolean;
  onClose: () => void;
  wikiSpacePickerLoading: boolean;
  wikiSpacePickerItems: WikiSpaceResponse[];
  kbWikiSpaces: KBWikiSpaceResponse[];
  wikiSpaceBusyId: string | null;
  onAddWikiSpaceToKb: (wikiSpaceId: string) => void;
}

export function KbWikiSpacePickerDialog({
  show,
  onClose,
  wikiSpacePickerLoading,
  wikiSpacePickerItems,
  kbWikiSpaces,
  wikiSpaceBusyId,
  onAddWikiSpaceToKb,
}: KbWikiSpacePickerDialogProps) {
  const { t } = useTranslation('knowledgeBase');
  if (!show) return null;

  const unlinkedItems = wikiSpacePickerItems.filter((w) => !kbWikiSpaces.some((k) => k.wiki_space_id === w.id));

  return (
    <div
      className="kb-doc-picker-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="wiki-picker-title"
    >
      <div className="kb-doc-picker kb-doc-picker--narrow" onClick={(e) => e.stopPropagation()}>
        <div className="kb-doc-picker-header">
          <h2 id="wiki-picker-title">{t('detail.wikiPickerTitle')}</h2>
          <button
            type="button"
            className="kb-doc-picker-close"
            onClick={onClose}
            disabled={Boolean(wikiSpaceBusyId)}
            aria-label={t('detail.closeAria')}
          >
            <X size={20} />
          </button>
        </div>
        <div className="kb-doc-picker-body">
          {wikiSpacePickerLoading ? (
            <p className="kb-empty-text">{t('detail.loading')}</p>
          ) : (
            <>
              <ul className="kb-wiki-picker-list">
                {unlinkedItems.map((w) => (
                  <li key={w.id} className="kb-wiki-picker-row">
                    <span className="kb-wiki-picker-name">{w.name}</span>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={wikiSpaceBusyId !== null}
                      onClick={() => onAddWikiSpaceToKb(w.id)}
                    >
                      {wikiSpaceBusyId === w.id ? (
                        <Loader2 size={16} className="kb-doc-picker-spinner" />
                      ) : (
                        <Plus size={16} />
                      )}
                      <span>{t('detail.linkWikiSpace')}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {unlinkedItems.length === 0 && (
                <p className="kb-empty-text">{t('detail.wikiPickerEmpty')}</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
