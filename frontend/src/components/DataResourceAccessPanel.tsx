import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  fetchResourceAcl,
  fetchResourceAclOwnerCandidates,
  putResourceAcl,
  RESOURCE_TYPES,
  type AclGrant,
  type OwnerCandidate,
} from "../data/resourceAclApi";
import { FormField } from "../styles/design-system";
import "./DataResourceAccessPanel.scss";

/**
 * Who may read one data resource.
 *
 * Who may **read** one data resource — nothing else.
 *
 * A data resource is a read-only row scope, so this panel answers a single question: may this
 * person query the rows it exposes? Two things it deliberately does not do:
 *
 * - **No write.** There is no content to edit; a `w` bit would authorize nothing.
 * - **No manage.** "May administer this resource" is not a data permission — it is who owns the
 *   thing, and it is decided in **Sharing** (like every other resource), not in the list of
 *   people allowed to read rows. Mixing the two let a reader's panel grant administrative
 *   rights as a side effect of saving.
 *
 * It does show **the row conditions being granted**: "read all Stock data" and "read only
 * semiconductor stocks" are different approvals, and the reviewer has to see which one it is.
 */
type Row = {
  grantee_type: "user" | "group" | "authenticated";
  grantee_id: string | null;
  label: string;
  read: boolean;
};

function toRows(grants: AclGrant[]): Row[] {
  return grants.map((g) => ({
    grantee_type: g.grantee_type,
    grantee_id: g.grantee_id,
    label:
      g.grantee_label?.trim() ||
      (g.grantee_type === "authenticated" ? "" : (g.grantee_id ?? "")),
    read: g.permissions.includes("r") || g.permissions.includes("m"),
  }));
}

interface Props {
  resourceId: string;
  /** Only used to label the "everyone signed in" row, which is about this resource. */
  resourceName: string;
}

export function DataResourceAccessPanel({ resourceId, resourceName }: Props) {
  const { t } = useTranslation("ontology");
  const [rows, setRows] = useState<Row[]>([]);
  const [candidates, setCandidates] = useState<OwnerCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pick, setPick] = useState("");
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const acl = await fetchResourceAcl(
        RESOURCE_TYPES.dataResource,
        resourceId,
      );
      setRows(toRows(acl.grants));
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : t("dataModel.resourceAccessLoadFailed"),
      );
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
    // A row with no read is not a grant: sending an empty permission set is rejected, and
    // "granted but may read nothing" is not a state this panel can express.
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
        // Read only: `m` is not ours to set from this panel (see the docstring above).
        grants.map((r) => ({
          grantee_type: r.grantee_type,
          grantee_id: r.grantee_id,
          permissions: 'r',
        })),
      );
      toast.success(t("dataModel.resourceAccessSaved"));
      await load();
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : t("dataModel.resourceAccessSaveFailed"),
      );
    } finally {
      setSaving(false);
    }
  };

  // Search the candidate list rather than scrolling a select: identity lists grow with the
  // instance, and the one you want is rarely near the top.
  const visibleCandidates = candidates.filter((c) => {
    if (rows.some((r) => r.grantee_id === c.subject)) return false;
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    return c.subject.toLowerCase().includes(q) || c.label.toLowerCase().includes(q);
  });

  const addGrantee = () => {
    if (!pick) return;
    const candidate = candidates.find((c) => c.subject === pick);
    if (rows.some((r) => r.grantee_id === pick)) {
      setPick("");
      return;
    }
    setRows((prev) => [
      ...prev,
      {
        grantee_type: "user",
        grantee_id: pick,
        label: candidate?.label || pick,
        read: true,
      },
    ]);
    setPick("");
  };

  return (
    <section className="data-resource-access">
      <p className="page-subtitle">{t('dataModel.resourceAccessHint')}</p>

      {loading ? (
        <p className="page-subtitle">{t("shared.loading")}</p>
      ) : (
        <table className="data-resource-access__table">
          <thead>
            <tr>
              <th>{t("dataModel.resourceAccessGrantee")}</th>
              <th>{t("dataModel.resourceAccessRead")}</th>
              <th aria-label={t("shared.delete")} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.grantee_type}:${row.grantee_id ?? "others"}`}>
                <td>
                  {row.grantee_type === "authenticated"
                    ? t("dataModel.resourceAccessOthers", {
                        name: resourceName,
                      })
                    : row.label}
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={row.read}
                    aria-label={t("dataModel.resourceAccessRead")}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((r, i) =>
                          i === index ? { ...r, read: e.target.checked } : r,
                        ),
                      )
                    }
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    aria-label={t("shared.delete")}
                    onClick={() =>
                      setRows((prev) => prev.filter((_, i) => i !== index))
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

      <div className="data-resource-access__add">
        <FormField label={t("dataModel.resourceAccessAdd")} hint={t("dataModel.resourceAccessSearch")}>
          <input
            type="search"
            className="ds-control"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPick("");
            }}
            placeholder={t("dataModel.resourceAccessSearchPlaceholder")}
            aria-label={t("dataModel.resourceAccessSearch")}
            autoComplete="off"
          />
          {filter.trim() ? (
            <select
              className="ds-control"
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              aria-label={t("dataModel.resourceAccessPick")}
            >
              <option value="">{t("dataModel.resourceAccessPick")}</option>
              {visibleCandidates.map((c) => (
                <option key={c.subject} value={c.subject}>
                  {c.label || c.subject}
                </option>
              ))}
            </select>
          ) : null}
        </FormField>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={!pick}
          onClick={addGrantee}
        >
          <Plus size={14} aria-hidden />
          {t("dataModel.resourceAccessAddOwner")}
        </button>
      </div>

      <div className="data-resource-access__actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? t("shared.saving") : t("dataModel.resourceAccessSave")}
        </button>
      </div>
    </section>
  );
}
