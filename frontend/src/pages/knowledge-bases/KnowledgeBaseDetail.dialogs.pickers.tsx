import { Loader2, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ChannelNode } from '../../data/channelsApi';
import type { DocumentListItemResponse } from '../../data/documentsApi';
import type { WikiSpaceResponse } from '../../data/wikiSpacesApi';
import type { KBWikiSpaceResponse } from '../../data/knowledgeBasesApi';
import { DocPickerChannelTree } from './KnowledgeBaseDetail.docPickerTree';
import { SearchField } from '../../styles/design-system';
import {
  PickerCheck,
  PickerDialog,
  PickerList,
  PickerPagination,
  PickerRow,
  PickerState,
} from '../../components/picker/PickerDialog';

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
    <PickerDialog
      open={show}
      onClose={onClose}
      closeDisabled={pickerAdding}
      title={t('detail.docPickerTitle')}
      footer={
        <>
          <span className="kb-doc-picker-count">
            {pickerSelected.size > 0
              ? t('detail.pickerSelected', { count: pickerSelected.size })
              : t('detail.pickerNoneSelected')}
          </span>
          <div className="openkms-flex-row-gap">
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
                  <Loader2 size={16} className="spin" aria-hidden />
                  <span>{t('detail.adding')}</span>
                </>
              ) : (
                <>
                  <Plus size={16} aria-hidden />
                  <span>
                    {pickerSelected.size > 0
                      ? t('detail.addButtonWithCount', { count: pickerSelected.size })
                      : t('detail.addButton')}
                  </span>
                </>
              )}
            </button>
          </div>
        </>
      }
      rail={
        <>
          <span className="kb-doc-picker-sidebar-label">{t('detail.channels')}</span>
          <ul className="kb-doc-picker-channel-tree">
            {channels.length === 0 ? (
              <li className="kb-doc-picker-channel-empty">{t('detail.noChannels')}</li>
            ) : (
              channels.map((ch) => (
                <DocPickerChannelTree
                  key={ch.id}
                  node={ch}
                  selectedId={pickerSelectedChannel}
                  expanded={pickerChannelExpanded}
                  onSelect={onPickerChannelSelect}
                  onToggle={onPickerChannelToggle}
                  depth={0}
                />
              ))
            )}
          </ul>
        </>
      }
    >
      <SearchField
        value={pickerSearch}
        onChange={onPickerSearch}
        label={t('detail.searchDocsPlaceholder')}
        disabled={!pickerSelectedChannel}
        autoFocus
      />
      {!pickerSelectedChannel ? (
        <PickerState>{t('detail.selectChannelFirst')}</PickerState>
      ) : pickerLoading ? (
        <PickerState loading>{t('detail.loadingDocs')}</PickerState>
      ) : pickerResults.length === 0 ? (
        <PickerState>{t('detail.noDocsFound')}</PickerState>
      ) : (
        <>
          <PickerList>
            {pickerResults.map((doc) => {
              const added = alreadyAddedIds.has(doc.id);
              const selected = pickerSelected.has(doc.id);
              return (
                <li key={doc.id}>
                  <PickerRow
                    name={doc.name}
                    meta={`${doc.file_type} · ${doc.status || 'completed'}`}
                    leading={
                      <PickerCheck selected={added || selected} />
                    }
                    trailing={added ? t('detail.addedBadge') : undefined}
                    selected={selected}
                    disabled={added}
                    onClick={added ? undefined : () => onTogglePickerDoc(doc.id)}
                  />
                </li>
              );
            })}
          </PickerList>
          {pickerTotal > 0 ? (
            <PickerPagination
              range={t('detail.pickerPageRange', {
                start: pickerPage * pickerPageSize + 1,
                end: Math.min((pickerPage + 1) * pickerPageSize, pickerTotal),
                total: pickerTotal,
              })}
              prevLabel={t('detail.pickerAriaPrevPage')}
              nextLabel={t('detail.pickerAriaNextPage')}
              canPrev={pickerCanPrev}
              canNext={pickerCanNext}
              onPrev={() => onPickerPageChange((p) => Math.max(0, p - 1))}
              onNext={() => onPickerPageChange((p) => Math.min(pickerTotalPages - 1, p + 1))}
            />
          ) : null}
        </>
      )}
    </PickerDialog>
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
    <PickerDialog
      open={show}
      onClose={onClose}
      closeDisabled={Boolean(wikiSpaceBusyId)}
      title={t('detail.wikiPickerTitle')}
      size="md"
    >
      {wikiSpacePickerLoading ? (
        <PickerState loading>{t('detail.loading')}</PickerState>
      ) : unlinkedItems.length === 0 ? (
        <PickerState>{t('detail.wikiPickerEmpty')}</PickerState>
      ) : (
        <PickerList>
          {unlinkedItems.map((w) => (
            <li key={w.id}>
              <PickerRow
                name={w.name}
                trailing={
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={wikiSpaceBusyId !== null}
                    onClick={() => onAddWikiSpaceToKb(w.id)}
                  >
                    {wikiSpaceBusyId === w.id ? (
                      <Loader2 size={14} className="spin" aria-hidden />
                    ) : (
                      <Plus size={14} aria-hidden />
                    )}
                    <span>{t('detail.linkWikiSpace')}</span>
                  </button>
                }
              />
            </li>
          ))}
        </PickerList>
      )}
    </PickerDialog>
  );
}
