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
import { Dialog, FormField } from '../styles/design-system';
import './DataResourceAccessPanel.scss';

/**
 * Who may **read** one data resource — the only permission this list grants.
 *
 * A data resource is a read-only row scope, so two things are deliberately absent:
 * `w` (nothing to write) and `m` (administration is *ownership*, set in **Sharing**, not in a
 * list about who can query rows — mixing them let saving a read list hand out admin rights).
 *
 * The toolbar filters the **grantee list**; adding a candidate is a dialog, so the table stays
 * about the people who already have access rather than doubling as a picker.
 */
type Row = {
  grantee_type: 'user' | 'group' | 'authenticated';
  grantee_id: string | null;
  label: string;
  read: boolean;
};

function toRows(grants: AclGrant[]): Row[] {
  return grants.map((g) => ({
    grantee_type: g.grantee_type,
    grantee_id: g.grantee_id,
    label:
      g.grantee_label?.trim() || (g.grantee_type === 'authenticated' ? '' : (g.grantee_id ?? '')),
    read: g.permissions.includes('r') || g.permissions.includes('m'),
  }));
}

interface Props {
  resourceId: string;
  /** Only used to label the "everyone signed in" row, which is about this resource. */
  resourceName: string;
}

export function DataResourceAccessPanel({ resourceId, resourceName }: Props) {
  const { t } = useTranslation('ontology');
  const [rows, setRows] = useState<Row[]>([]);
  const [candidates, setCandidates] = useState<OwnerCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Toolbar filter over the grantees already listed.
  const [filter, setFilter] = useState('');
  // Dialog state for adding someone new.
  const [adding, setAdding] = useState(false);
  const [pick, setPick] = useState('');
  const [candidateQuery, setCandidateQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const acl = await fetchResourceAcl(RESOURCE_TYPES.dataResource, resourceId);
      setRows(toRows(acl.grants));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataModel.resourceAccessLoadFailed'));
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

  const save = async () => {
    const grants = rows.filter((r) => r.read);
    if (!grants.length) {
      toast.error(t('dataModel.resourceAccessNeedsReader'));
      return;
    }
    setSaving(true);
    try {
      await putResourceAcl(
        RESOURCE_TYPES.dataResource,
        resourceId,
        grants.map((r) => ({
          grantee_type: r.grantee_type,
          grantee_id: r.grantee_id,
          permissions: 'r',
        })),
      );
      toast.success(t('dataModel.resourceAccessSaved'));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataModel.resourceAccessSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const visibleRows = rows.filter((r) => {
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    return r.label.toLowerCase().includes(q);
  });

  const availableCandidates = candidates.filter((c) => {
    if (rows.some((r) => r.grantee_id === c.subject)) return false;
    const q = candidateQuery.trim().toLowerCase();
    if (!q) return true;
    return c.subject.toLowerCase().includes(q) || c.label.toLowerCase().includes(q);
  });

  const confirmAdd = () => {
    if (!pick) return;
    const candidate = candidates.find((c) => c.subject === pick);
    setRows((prev) => [
      ...prev,
      {
        grantee_type: 'user',
        grantee_id: pick,
        label: candidate?.label || pick,
        read: true,
      },
    ]);
    setAdding(false);
    setPick('');
    setCandidateQuery('');
  };

  return (
    <>
      <div className="settings-page-form">
        <p className="page-subtitle data-resource-access__intro">
          {t('dataModel.resourceAccessHint')}
        </p>

        <div className="data-resource-access__toolbar">
          <div className="data-resource-access__search">
            <Search size={15} strokeWidth={2} aria-hidden />
            <input
              type="search"
              className="ds-control"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t('dataModel.resourceAccessFilterPlaceholder')}
              aria-label={t('dataModel.resourceAccessFilterPlaceholder')}
              autoComplete="off"
            />
          </div>
          <button type="button" className="btn btn-secondary" onClick={() => setAdding(true)}>
            <Plus size={15} aria-hidden />
            {t('dataModel.resourceAccessAdd')}
          </button>
        </div>

        {loading ? (
          <p className="page-subtitle">{t('shared.loading')}</p>
        ) : visibleRows.length === 0 ? (
          <p className="page-subtitle">
            {rows.length === 0
              ? t('dataModel.resourceAccessEmpty')
              : t('dataModel.resourceAccessNoMatch')}
          </p>
        ) : (
          <table className="data-resource-access__table">
            <thead>
              <tr>
                <th>{t('dataModel.resourceAccessGrantee')}</th>
                <th>{t('dataModel.resourceAccessRead')}</th>
                <th aria-label={t('shared.delete')} />
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={`${row.grantee_type}:${row.grantee_id ?? 'others'}`}>
                  <td>
                    {row.grantee_type === 'authenticated'
                      ? t('dataModel.resourceAccessOthers', { name: resourceName })
                      : row.label}
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={row.read}
                      aria-label={t('dataModel.resourceAccessRead')}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r) =>
                            r.grantee_type === row.grantee_type &&
                            r.grantee_id === row.grantee_id
                              ? { ...r, read: e.target.checked }
                              : r,
                          ),
                        )
                      }
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      aria-label={t('shared.delete')}
                      onClick={() =>
                        setRows((prev) =>
                          prev.filter(
                            (r) =>
                              !(
                                r.grantee_type === row.grantee_type &&
                                r.grantee_id === row.grantee_id
                              ),
                          ),
                        )
                      }
                    >
                      <Trash2 size={14} aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="data-resource-access__actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? t('shared.saving') : t('dataModel.resourceAccessSave')}
          </button>
        </div>
      </div>

      <Dialog
        open={adding}
        onClose={() => {
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
              disabled={!pick}
              onClick={confirmAdd}
            >
              {t('dataModel.resourceAccessAddConfirm')}
            </button>
          </>
        }
      >
        <FormField
          label={t('dataModel.resourceAccessSearch')}
          hint={t('dataModel.resourceAccessSearchHint')}
        >
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
            <ul className="data-resource-access__candidates">
              {availableCandidates.map((c) => (
                <li key={c.subject}>
                  <button
                    type="button"
                    className={`data-resource-access__candidate${pick === c.subject ? ' is-picked' : ''}`}
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
