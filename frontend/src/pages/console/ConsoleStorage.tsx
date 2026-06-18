import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Folder, File, Loader2, MoveRight, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { ErrorBanner } from '../../components/ErrorBanner';
import {
  fetchStorageInfo,
  fetchStorageObjects,
  moveStorageObjects,
  type StorageFolderItem,
  type StorageMoveItem,
  type StorageObjectItem,
} from '../../data/storageApi';
import './ConsoleStorage.scss';

const LEGACY_HASH_PREFIX_RE = /^[a-f0-9]{64}\/$/;

type Row =
  | { kind: 'folder'; item: StorageFolderItem }
  | { kind: 'object'; item: StorageObjectItem };

function rowKey(row: Row): string {
  return row.kind === 'folder' ? `folder:${row.item.prefix}` : `object:${row.item.key}`;
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function folderDisplayName(prefix: string, currentPrefix: string): string {
  const rel = prefix.startsWith(currentPrefix) ? prefix.slice(currentPrefix.length) : prefix;
  return rel.replace(/\/$/, '') || prefix;
}

function objectDisplayName(key: string, currentPrefix: string): string {
  const rel = key.startsWith(currentPrefix) ? key.slice(currentPrefix.length) : key;
  return rel || key;
}

export function ConsoleStorage() {
  const { t } = useTranslation('console');
  const [bucket, setBucket] = useState('');
  const [prefix, setPrefix] = useState('');
  const [folders, setFolders] = useState<StorageFolderItem[]>([]);
  const [objects, setObjects] = useState<StorageObjectItem[]>([]);
  const [continuationToken, setContinuationToken] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [destPrefix, setDestPrefix] = useState('');
  const [deleteSource, setDeleteSource] = useState(true);

  const rows: Row[] = useMemo(
    () => [
      ...folders.map((item) => ({ kind: 'folder' as const, item })),
      ...objects.map((item) => ({ kind: 'object' as const, item })),
    ],
    [folders, objects],
  );

  const isRoot = prefix === '';

  const loadPage = useCallback(
    async (targetPrefix: string, token: string | null, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const page = await fetchStorageObjects({
          prefix: targetPrefix,
          continuation_token: token,
        });
        setPrefix(page.prefix);
        setFolders((prev) => (append ? [...prev, ...page.folders] : page.folders));
        setObjects((prev) => (append ? [...prev, ...page.objects] : page.objects));
        setContinuationToken(page.next_continuation_token);
        setTruncated(page.truncated);
        if (!append) setSelected(new Set());
      } catch (e) {
        setError(e instanceof Error ? e.message : t('storage.loadFailed'));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [t],
  );

  useEffect(() => {
    void (async () => {
      try {
        const info = await fetchStorageInfo();
        setBucket(info.bucket);
        if (!info.storage_enabled) {
          setError(t('storage.notConfigured'));
          setLoading(false);
          return;
        }
        await loadPage('', null, false);
      } catch (e) {
        setError(e instanceof Error ? e.message : t('storage.loadFailed'));
        setLoading(false);
      }
    })();
  }, [loadPage, t]);

  const breadcrumbParts = useMemo(() => {
    if (!prefix) return [];
    const parts = prefix.replace(/\/$/, '').split('/');
    const acc: { label: string; path: string }[] = [];
    let p = '';
    for (const part of parts) {
      p = p ? `${p}${part}/` : `${part}/`;
      acc.push({ label: part, path: p });
    }
    return acc;
  }, [prefix]);

  const toggleRow = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectLegacyOnPage = () => {
    const next = new Set(selected);
    for (const row of rows) {
      if (row.kind === 'folder' && isRoot && LEGACY_HASH_PREFIX_RE.test(row.item.prefix)) {
        next.add(rowKey(row));
      }
    }
    setSelected(next);
  };

  const openMoveDialog = () => {
    if (selected.size === 0) return;
    const onlyLegacyFolders =
      isRoot &&
      [...selected].every((k) => {
        const row = rows.find((r) => rowKey(r) === k);
        return row?.kind === 'folder' && LEGACY_HASH_PREFIX_RE.test(row.item.prefix);
      });
    if (onlyLegacyFolders && selected.size === 1) {
      const row = rows.find((r) => rowKey(r) === [...selected][0]);
      if (row?.kind === 'folder') {
        const hash = row.item.prefix.replace(/\/$/, '');
        setDestPrefix(`documents/${hash}/`);
      } else {
        setDestPrefix('');
      }
    } else {
      setDestPrefix('');
    }
    setShowMoveDialog(true);
  };

  const moveSelectedToDocuments = async () => {
    setMoving(true);
    try {
      let totalMoved = 0;
      for (const key of selected) {
        const row = rows.find((r) => rowKey(r) === key);
        if (!row || row.kind !== 'folder' || !LEGACY_HASH_PREFIX_RE.test(row.item.prefix)) continue;
        const hash = row.item.prefix.replace(/\/$/, '');
        const result = await moveStorageObjects({
          items: [{ type: 'prefix', key: row.item.prefix }],
          destination_prefix: `documents/${hash}/`,
          delete_source: deleteSource,
        });
        totalMoved += result.moved_count;
        if (result.errors.length) {
          toast.error(result.errors[0]);
        }
      }
      if (totalMoved > 0) {
        toast.success(t('storage.moveToDocumentsDone', { count: totalMoved }));
      }
      setSelected(new Set());
      await loadPage(prefix, null, false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('storage.moveFailed'));
    } finally {
      setMoving(false);
    }
  };

  const confirmMove = async () => {
    const items: StorageMoveItem[] = [];
    for (const key of selected) {
      const row = rows.find((r) => rowKey(r) === key);
      if (!row) continue;
      if (row.kind === 'folder') items.push({ type: 'prefix', key: row.item.prefix });
      else items.push({ type: 'object', key: row.item.key });
    }
    if (!destPrefix.trim()) {
      toast.error(t('storage.destRequired'));
      return;
    }
    setMoving(true);
    try {
      const result = await moveStorageObjects({
        items,
        destination_prefix: destPrefix.trim(),
        delete_source: deleteSource,
      });
      setShowMoveDialog(false);
      if (result.errors.length) {
        toast.error(result.errors.slice(0, 2).join('; '));
      }
      toast.success(
        t('storage.moveSuccess', { moved: result.moved_count, skipped: result.skipped_count }),
      );
      setSelected(new Set());
      await loadPage(prefix, null, false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('storage.moveFailed'));
    } finally {
      setMoving(false);
    }
  };

  return (
    <div className="console-storage">
      <div className="page-header">
        <h1>{t('storage.pageTitle')}</h1>
        <p className="page-subtitle">
          {t('storage.subtitle', { bucket: bucket || '…' })}
        </p>
      </div>

      {error && <ErrorBanner message={error} />}

      <div className="console-storage-toolbar">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void loadPage(prefix, null, false)}
          disabled={loading || moving}
        >
          <RefreshCw size={16} />
          <span>{t('storage.refresh')}</span>
        </button>
        {isRoot && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={selectLegacyOnPage}
            disabled={loading || moving || rows.length === 0}
          >
            {t('storage.selectLegacyOnPage')}
          </button>
        )}
        {isRoot && selected.size > 0 && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void moveSelectedToDocuments()}
            disabled={moving}
          >
            <MoveRight size={16} />
            <span>{t('storage.moveToDocuments')}</span>
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary"
          onClick={openMoveDialog}
          disabled={selected.size === 0 || moving}
        >
          <MoveRight size={16} />
          <span>{t('storage.moveSelected')}</span>
        </button>
      </div>

      <nav className="console-storage-breadcrumb" aria-label={t('storage.breadcrumbAria')}>
        <button type="button" onClick={() => void loadPage('', null, false)}>
          {bucket || t('storage.root')}
        </button>
        {breadcrumbParts.map((part) => (
          <span key={part.path}>
            <span aria-hidden> / </span>
            <button type="button" onClick={() => void loadPage(part.path, null, false)}>
              {part.label}
            </button>
          </span>
        ))}
      </nav>

      {loading ? (
        <p className="console-storage-empty">
          <Loader2 size={18} className="spin" /> {t('storage.loading')}
        </p>
      ) : rows.length === 0 ? (
        <p className="console-storage-empty">{t('storage.empty')}</p>
      ) : (
        <div className="console-storage-table-wrap">
          <table className="console-storage-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <span className="sr-only">{t('storage.selectCol')}</span>
                </th>
                <th>{t('storage.colName')}</th>
                <th>{t('storage.colType')}</th>
                <th>{t('storage.colSize')}</th>
                <th>{t('storage.colModified')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const key = rowKey(row);
                const isLegacy =
                  row.kind === 'folder' && isRoot && LEGACY_HASH_PREFIX_RE.test(row.item.prefix);
                return (
                  <tr
                    key={key}
                    className={`console-storage-row--${row.kind}${isLegacy ? ' console-storage-row--legacy' : ''}`}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(key)}
                        onChange={() => toggleRow(key)}
                        aria-label={t('storage.selectItem')}
                      />
                    </td>
                    <td>
                      {row.kind === 'folder' ? (
                        <button
                          type="button"
                          className="console-storage-name"
                          onClick={() => void loadPage(row.item.prefix, null, false)}
                        >
                          <Folder size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                          {folderDisplayName(row.item.prefix, prefix)}
                        </button>
                      ) : (
                        <span className="console-storage-name">
                          <File size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                          {objectDisplayName(row.item.key, prefix)}
                        </span>
                      )}
                    </td>
                    <td>{row.kind === 'folder' ? t('storage.typeFolder') : t('storage.typeFile')}</td>
                    <td>{row.kind === 'object' ? formatBytes(row.item.size) : '—'}</td>
                    <td>
                      {row.kind === 'object' ? formatDate(row.item.last_modified) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {truncated && continuationToken && (
        <div className="console-storage-load-more">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={loadingMore}
            onClick={() => void loadPage(prefix, continuationToken, true)}
          >
            {loadingMore ? (
              <>
                <Loader2 size={16} className="spin" /> {t('storage.loading')}
              </>
            ) : (
              t('storage.loadMore')
            )}
          </button>
        </div>
      )}

      {showMoveDialog && (
        <div className="modal-overlay" role="presentation" onClick={() => setShowMoveDialog(false)}>
          <div
            className="modal"
            role="dialog"
            aria-labelledby="storage-move-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="storage-move-title">{t('storage.moveDialogTitle')}</h2>
            <p className="page-subtitle">{t('storage.moveDialogHint', { count: selected.size })}</p>
            <div className="console-storage-move-form">
              <label htmlFor="storage-dest">{t('storage.destLabel')}</label>
              <input
                id="storage-dest"
                type="text"
                value={destPrefix}
                onChange={(e) => setDestPrefix(e.target.value)}
                placeholder={t('storage.destPlaceholder')}
              />
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={deleteSource}
                  onChange={(e) => setDeleteSource(e.target.checked)}
                />
                <span>{t('storage.deleteSource')}</span>
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowMoveDialog(false)}>
                {t('storage.cancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={moving}
                onClick={() => void confirmMove()}
              >
                {moving ? t('storage.moving') : t('storage.confirmMove')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
