import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchResourceAcl,
  fetchResourceAclOwnerCandidates,
  putResourceAcl,
  RESOURCE_TYPES,
  type AclGrant,
  type OwnerCandidate,
} from '../data/resourceAclApi';
import { Dialog, FormField, Pagination } from '../styles/design-system';
import './DataResourceGranteesPanel.scss';

const PAGE_SIZE_DEFAULT = 10;

/**
 * Who may **read** one data resource — the only permission this list grants.
 *
 * A data resource is a read-only row scope, so two things are deliberately absent:
 * `w` (nothing to write) and `m` (administration is *ownership*, set in **Sharing**).
 *
 * Add and remove write through immediately: a draft + Save step made delete look like it
 * already worked while the grant was still live.
 */
type Row = {
  grantee_type: 'user' | 'group' | 'authenticated';
  grantee_id: string | null;
  label: string;
};

function toRows(grants: AclGrant[]): Row[] {
  return grants
    .filter((g) => g.permissions.includes('r') || g.permissions.includes('m'))
    .map((g) => ({
      grantee_type: g.grantee_type,
      grantee_id: g.grantee_id,
      label:
        g.grantee_label?.trim() ||
        (g.grantee_type === 'authenticated' ? '' : (g.grantee_id ?? '')),
    }));
}

interface Props {
  resourceId: string;
  /** Only used to label the "everyone signed in" row, which is about this resource. */
  resourceName: string;
}

export function DataResourceGranteesPanel({ resourceId, resourceName }: Props) {
  const { t } = useTranslation('ontology');
  const [rows, setRows] = useState<Row[]>([]);
  const [candidates, setCandidates] = useState<OwnerCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT);
  const [adding, setAdding] = useState(false);
  const [pick, setPick] = useState('');
  const [candidateQuery, setCandidateQuery] = useState('');
  //: Sharing is a **management** view. Someone who can read the resource but not manage it gets a 404 from the ACL (which
  //: deliberately does not reveal whether the resource exists) — that is not a failure to report, it is an answer.
  const [notManager, setNotManager] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const acl = await fetchResourceAcl(RESOURCE_TYPES.dataResource, resourceId);
      setRows(toRows(acl.grants));
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 403 || status === 404) {
        setNotManager(true);
      } else {
        toast.error(e instanceof Error ? e.message : t('dataModel.resourceAccessLoadFailed'));
      }
    } finally {
      setLoading(false);
    }
  }, [resourceId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    fetchResourceAclOwnerCandidates(RESOURCE_TYPES.dataResource, resourceId)
      .then(setCandidates)
      .catch(() => setCandidates([]));
  }, [resourceId]);

  const persist = async (next: Row[]): Promise<boolean> => {
    if (!next.length) {
      toast.error(t('dataModel.resourceAccessNeedsReader'));
      return false;
    }
    setBusy(true);
    try {
      await putResourceAcl(
        RESOURCE_TYPES.dataResource,
        resourceId,
        next.map((r) => ({
          grantee_type: r.grantee_type,
          grantee_id: r.grantee_id,
          permissions: 'r',
        })),
      );
      setRows(next);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataModel.resourceAccessSaveFailed'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const visibleRows = rows.filter((r) => {
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    return r.label.toLowerCase().includes(q);
  });

  // The ACL endpoint returns the whole grant list, so paging is over the filtered array. Clamp
  // instead of storing an out-of-range page: removing the last row of page 3 must not blank the
  // table while earlier rows still exist.
  const pageCount = Math.max(1, Math.ceil(visibleRows.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pagedRows = visibleRows.slice(safePage * pageSize, safePage * pageSize + pageSize);

  const availableCandidates = candidates.filter((c) => {
    if (rows.some((r) => r.grantee_id === c.subject)) return false;
    const q = candidateQuery.trim().toLowerCase();
    if (!q) return true;
    return c.subject.toLowerCase().includes(q) || c.label.toLowerCase().includes(q);
  });

  const confirmAdd = async () => {
    if (!pick) return;
    const candidate = candidates.find((c) => c.subject === pick);
    const next: Row[] = [
      ...rows,
      {
        grantee_type: 'user',
        grantee_id: pick,
        label: candidate?.label || pick,
      },
    ];
    if (await persist(next)) {
      setAdding(false);
      setPick('');
      setCandidateQuery('');
    }
  };

  const removeRow = async (row: Row) => {
    const next = rows.filter(
      (r) => !(r.grantee_type === row.grantee_type && r.grantee_id === row.grantee_id),
    );
    await persist(next);
  };

  return (
    <>
      <div className="settings-page-form">
        <p className="page-subtitle data-resource-grantees__intro">
          {t('dataModel.resourceAccessHint')}
        </p>

        <div className="data-resource-grantees__toolbar">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => setAdding(true)}
          >
            <Plus size={15} aria-hidden />
            {t('dataModel.resourceAccessAdd')}
          </button>
          <div className="data-resource-grantees__search">
            <Search size={15} strokeWidth={2} aria-hidden />
            <input
              type="search"
              className="ds-control"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setPage(0);
              }}
              placeholder={t('dataModel.resourceAccessFilterPlaceholder')}
              aria-label={t('dataModel.resourceAccessFilterPlaceholder')}
              autoComplete="off"
            />
          </div>
        </div>

        {loading ? (
          <p className="page-subtitle">{t('shared.loading')}</p>
        ) : notManager ? (
          <p className="page-subtitle">{t('dataModel.resourceAccessNotManager')}</p>
        ) : visibleRows.length === 0 ? (
          <p className="page-subtitle">
            {rows.length === 0
              ? t('dataModel.resourceAccessEmpty')
              : t('dataModel.resourceAccessNoMatch')}
          </p>
        ) : (
          <>
            <table className="data-resource-grantees__table">
              <thead>
                <tr>
                  <th>{t('dataModel.resourceAccessGrantee')}</th>
                  <th aria-label={t('shared.delete')} />
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((row) => (
                  <tr key={`${row.grantee_type}:${row.grantee_id ?? 'others'}`}>
                    <td>
                      {row.grantee_type === 'authenticated'
                        ? t('dataModel.resourceAccessOthers', { name: resourceName })
                        : row.label}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        aria-label={t('shared.delete')}
                        disabled={busy}
                        onClick={() => void removeRow(row)}
                      >
                        <Trash2 size={14} aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visibleRows.length > PAGE_SIZE_DEFAULT ? (
              <Pagination
                className="data-resource-grantees__pagination"
                total={visibleRows.length}
                page={safePage}
                pageSize={pageSize}
                loading={busy}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(0);
                }}
              />
            ) : null}
          </>
        )}
      </div>

      <Dialog
        open={adding}
        onClose={() => {
          if (busy) return;
          setAdding(false);
          setPick('');
          setCandidateQuery('');
        }}
        title={t('dataModel.resourceAccessAdd')}
        size="md"
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => {
                setAdding(false);
                setPick('');
                setCandidateQuery('');
              }}
            >
              {t('shared.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!pick || busy}
              onClick={() => void confirmAdd()}
            >
              {busy ? t('shared.saving') : t('dataModel.resourceAccessAddConfirm')}
            </button>
          </>
        }
      >
        <FormField label={t('dataModel.resourceAccessSearch')}>
          <input
            type="search"
            className="ds-control"
            value={candidateQuery}
            onChange={(e) => {
              setCandidateQuery(e.target.value);
              setPick('');
            }}
            placeholder={t('dataModel.resourceAccessSearchPlaceholder')}
            autoFocus
            autoComplete="off"
          />
        </FormField>
        {candidateQuery.trim() ? (
          availableCandidates.length === 0 ? (
            <p className="page-subtitle">{t('dataModel.resourceAccessNoCandidate')}</p>
          ) : (
            <ul className="data-resource-grantees__candidates">
              {availableCandidates.map((c) => (
                <li key={c.subject}>
                  <button
                    type="button"
                    className={`data-resource-grantees__candidate${pick === c.subject ? ' is-picked' : ''}`}
                    onClick={() => setPick(c.subject)}
                  >
                    {c.label || c.subject}
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </Dialog>
    </>
  );
}
