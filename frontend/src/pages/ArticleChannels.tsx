import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Folder, Plus, ArrowRightLeft, Trash2, GitMerge, ChevronUp, ChevronDown, Settings } from 'lucide-react';
import { useArticleChannels } from '../contexts/ArticleChannelsContext';
import {
  createArticleChannel,
  updateArticleChannel,
  deleteArticleChannel,
  mergeArticleChannels,
  reorderArticleChannel,
} from '../data/articleChannelsApi';
import { getDescendantIds, type ChannelNode } from '../data/channelUtils';
import { toast } from 'sonner';
import './DocumentChannels.css';

function flattenForParent(nodes: ChannelNode[], depth = 0): { id: string; name: string; depth: number }[] {
  const out: { id: string; name: string; depth: number }[] = [];
  for (const n of nodes) {
    out.push({ id: n.id, name: n.name, depth });
    if (n.children?.length) out.push(...flattenForParent(n.children, depth + 1));
  }
  return out;
}

export function ArticleChannels() {
  const { t } = useTranslation('articles');
  const { channels, loading, error, refetch } = useArticleChannels();
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createParentId, setCreateParentId] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = createName.trim();
    if (!name) return;
    setCreating(true);
    setCreateError(null);
    try {
      await createArticleChannel({
        name,
        description: createDescription.trim() || null,
        parent_id: createParentId || null,
      });
      setCreateName('');
      setCreateDescription('');
      setCreateParentId('');
      await refetch();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : t('channels.createFailed'));
    } finally {
      setCreating(false);
    }
  };

  const parentOptions = flattenForParent(channels);
  const parentNoneLabel = t('channels.parentNone');

  const getMoveParentOptions = (excludeChannelId: string) => {
    const exclude = getDescendantIds(channels, excludeChannelId);
    return [{ id: '', name: parentNoneLabel, depth: 0 }, ...parentOptions.filter((p) => !exclude.has(p.id))];
  };

  const getMergeTargetOptions = (sourceChannelId: string) => {
    const exclude = getDescendantIds(channels, sourceChannelId);
    return parentOptions.filter((p) => !exclude.has(p.id));
  };

  return (
    <div className="document-channels">
      <Link to="/articles" className="document-channels-back">
        <ArrowLeft size={18} />
        <span>{t('channels.backToArticles')}</span>
      </Link>

      <div className="page-header">
        <h1>{t('channels.pageTitle')}</h1>
        <p className="page-subtitle">{t('channels.pageSubtitle')}</p>
      </div>

      {(error || createError) && (
        <div className="document-channels-error" role="alert">
          {createError || error}
        </div>
      )}

      <div className="document-channels-layout">
        <section className="document-channels-create">
          <h2>
            <Plus size={20} />
            {t('channels.newChannel')}
          </h2>
          <form onSubmit={handleCreate} className="document-channels-form">
            <div className="document-channels-field">
              <label htmlFor="ac-channel-name">{t('channels.name')}</label>
              <input
                id="ac-channel-name"
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder={t('channels.namePlaceholder')}
                required
              />
            </div>
            <div className="document-channels-field">
              <label htmlFor="ac-channel-description">{t('channels.description')}</label>
              <textarea
                id="ac-channel-description"
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                placeholder={t('channels.descPlaceholder')}
                rows={2}
              />
            </div>
            <div className="document-channels-field">
              <label htmlFor="ac-channel-parent">{t('channels.parent')}</label>
              <select
                id="ac-channel-parent"
                value={createParentId}
                onChange={(e) => setCreateParentId(e.target.value)}
              >
                <option value="">{parentNoneLabel}</option>
                {parentOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {'—'.repeat(p.depth)} {p.name}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn-primary" disabled={creating || !createName.trim()}>
              {creating ? t('channels.creating') : t('channels.create')}
            </button>
          </form>
        </section>

        <section className="document-channels-list">
          <h2>
            <Folder size={20} />
            {t('channels.listHeading')}
          </h2>
          {loading ? (
            <p className="document-channels-loading">{t('channels.loading')}</p>
          ) : channels.length === 0 ? (
            <div className="document-channels-empty">
              <Folder size={40} />
              <p>{t('channels.emptyTitle')}</p>
              <p className="document-channels-empty-hint">
                {t('channels.emptyHint')}
              </p>
            </div>
          ) : (
            <ul className="document-channels-tree">
              {channels.map((ch, index) => (
                <ChannelItem
                  key={ch.id}
                  node={ch}
                  depth={0}
                  siblingIndex={index}
                  siblingsCount={channels.length}
                  refetch={refetch}
                  getMoveParentOptions={getMoveParentOptions}
                  getMergeTargetOptions={getMergeTargetOptions}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function ChannelItem({
  node,
  depth,
  siblingIndex,
  siblingsCount,
  refetch,
  getMoveParentOptions,
  getMergeTargetOptions,
}: {
  node: ChannelNode;
  depth: number;
  siblingIndex: number;
  siblingsCount: number;
  refetch: () => Promise<void>;
  getMoveParentOptions: (excludeId: string) => { id: string; name: string; depth: number }[];
  getMergeTargetOptions: (sourceId: string) => { id: string; name: string; depth: number }[];
}) {
  const { t } = useTranslation('articles');
  const [moving, setMoving] = useState(false);
  const [moveParentId, setMoveParentId] = useState('');
  const [moveLoading, setMoveLoading] = useState(false);
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [merging, setMerging] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [mergeIncludeDescendants, setMergeIncludeDescendants] = useState(true);
  const [mergeLoading, setMergeLoading] = useState(false);

  const canMoveUp = siblingIndex > 0;
  const canMoveDown = siblingIndex < siblingsCount - 1;

  const handleReorder = async (direction: 'up' | 'down') => {
    try {
      await reorderArticleChannel(node.id, direction);
      await refetch();
      toast.success(
        direction === 'up'
          ? t('channels.toastMovedUp', { name: node.name })
          : t('channels.toastMovedDown', { name: node.name }),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('channels.toastReorderFail'));
    }
  };

  const moveOptions = getMoveParentOptions(node.id);
  const mergeTargetOptions = getMergeTargetOptions(node.id);

  const handleMoveConfirm = async () => {
    const newParent = moveParentId || null;
    if (newParent === node.id) return;
    setMoveLoading(true);
    try {
      await updateArticleChannel(node.id, { parent_id: newParent });
      await refetch();
      toast.success(t('channels.toastMoved', { name: node.name }));
      setMoving(false);
      setMoveParentId('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('channels.toastMoveFail'));
    } finally {
      setMoveLoading(false);
    }
  };

  const handleMoveCancel = () => {
    setMoving(false);
    setMoveParentId('');
  };

  const handleDeleteClick = () => setDeleteConfirming(true);
  const handleDeleteCancel = () => setDeleteConfirming(false);
  const handleDeleteConfirm = async () => {
    setDeleteLoading(true);
    try {
      await deleteArticleChannel(node.id);
      await refetch();
      toast.success(t('channels.toastDeleted', { name: node.name }));
      setDeleteConfirming(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('channels.toastDeleteFail'));
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleMergeConfirm = async () => {
    if (!mergeTargetId) return;
    setMergeLoading(true);
    try {
      await mergeArticleChannels({
        source_channel_id: node.id,
        target_channel_id: mergeTargetId,
        include_descendants: mergeIncludeDescendants,
      });
      await refetch();
      toast.success(t('channels.toastMerged', { name: node.name }));
      setMerging(false);
      setMergeTargetId('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('channels.toastMergeFail'));
    } finally {
      setMergeLoading(false);
    }
  };

  const handleMergeCancel = () => {
    setMerging(false);
    setMergeTargetId('');
  };

  return (
    <li style={{ paddingLeft: depth * 20 }} className="document-channels-tree-li">
      <span className="document-channels-tree-item">
        <Folder size={16} />
        {node.name}
        <span className="document-channels-tree-id">{node.id}</span>
        <span className="document-channels-tree-actions">
          <button
            type="button"
            className="document-channels-tree-action"
            title={t('channels.moveUpTitle')}
            aria-label={t('channels.moveUpAria')}
            onClick={() => void handleReorder('up')}
            disabled={!canMoveUp}
          >
            <ChevronUp size={14} />
          </button>
          <button
            type="button"
            className="document-channels-tree-action"
            title={t('channels.moveDownTitle')}
            aria-label={t('channels.moveDownAria')}
            onClick={() => void handleReorder('down')}
            disabled={!canMoveDown}
          >
            <ChevronDown size={14} />
          </button>
          <Link
            to={`/articles/channels/${node.id}/settings`}
            className="document-channels-tree-action"
            title={t('channels.settingsTitle')}
          >
            <Settings size={14} />
          </Link>
          <button
            type="button"
            className="document-channels-tree-action"
            title={t('channels.moveTitle')}
            onClick={() => setMoving(true)}
          >
            <ArrowRightLeft size={14} />
          </button>
          <button
            type="button"
            className="document-channels-tree-action"
            title={t('channels.mergeIntoTitle')}
            onClick={() => setMerging(true)}
            disabled={mergeTargetOptions.length === 0}
          >
            <GitMerge size={14} />
          </button>
          <button
            type="button"
            className="document-channels-tree-action document-channels-tree-action-delete"
            title={t('channels.deleteTitle')}
            onClick={handleDeleteClick}
          >
            <Trash2 size={14} />
          </button>
        </span>
      </span>
      {deleteConfirming && (
        <div className="document-channels-confirm-bar">
          <span>{t('channels.deleteConfirm', { name: node.name })}</span>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void handleDeleteConfirm()}
            disabled={deleteLoading}
          >
            {deleteLoading ? t('channels.deleting') : t('channels.delete')}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleDeleteCancel}>
            {t('channels.cancel')}
          </button>
        </div>
      )}
      {merging && (
        <div className="document-channels-merge-bar">
          <select
            value={mergeTargetId}
            onChange={(e) => setMergeTargetId(e.target.value)}
            className="document-channels-move-select"
            aria-label={t('channels.targetChannelAria')}
          >
            <option value="">{t('channels.mergeTargetPlaceholder')}</option>
            {mergeTargetOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {'—'.repeat(p.depth)} {p.name}
              </option>
            ))}
          </select>
          <label className="document-channels-merge-check">
            <input
              type="checkbox"
              checked={mergeIncludeDescendants}
              onChange={(e) => setMergeIncludeDescendants(e.target.checked)}
            />
            <span>{t('channels.includeSubchannels')}</span>
          </label>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void handleMergeConfirm()}
            disabled={mergeLoading || !mergeTargetId}
          >
            {mergeLoading ? t('channels.merging') : t('channels.merge')}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleMergeCancel}>
            {t('channels.cancel')}
          </button>
        </div>
      )}
      {moving && (
        <div className="document-channels-move-bar">
          <select
            value={moveParentId}
            onChange={(e) => setMoveParentId(e.target.value)}
            className="document-channels-move-select"
          >
            {moveOptions.map((p) => (
              <option key={p.id || 'root'} value={p.id}>
                {'—'.repeat(p.depth)} {p.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void handleMoveConfirm()}
            disabled={moveLoading}
          >
            {moveLoading ? t('channels.moving') : t('channels.move')}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleMoveCancel}>
            {t('channels.cancel')}
          </button>
        </div>
      )}
      {node.children?.length ? (
        <ul className="document-channels-tree">
          {node.children.map((ch, index) => (
            <ChannelItem
              key={ch.id}
              node={ch}
              depth={depth + 1}
              siblingIndex={index}
              siblingsCount={node.children?.length ?? 0}
              refetch={refetch}
              getMoveParentOptions={getMoveParentOptions}
              getMergeTargetOptions={getMergeTargetOptions}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
