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
import type { RowPolicyCondition } from "../data/dataResourcesApi";
import { FormField } from "../styles/design-system";
import "./DataResourceAccessPanel.scss";

/**
 * Who may read one data resource.
 *
 * Deliberately **not** the generic sharing panel. A data resource is a row-scoped, read-only
 * capability: it has no contents to edit, so a `write` checkbox would offer a permission that no
 * check reads — and the generic panel's "Channel creator / New channels" wording describes
 * documents, not data grants. What matters here is narrower and worth stating plainly:
 *
 * - **read** — may query the rows this resource exposes;
 * - **manage** — may change this list (an administrative act, shown separately);
 * - **the row conditions** — because "read all Stock data" and "read only semiconductor stocks"
 *   are different grants, and the approver has to see which one they are making.
 */
type Row = {
  grantee_type: "user" | "group" | "authenticated";
  grantee_id: string | null;
  label: string;
  read: boolean;
  manage: boolean;
};

function permsOf(read: boolean, manage: boolean): string {
  return `${read ? "r" : ""}${manage ? "m" : ""}`;
}

function toRows(grants: AclGrant[]): Row[] {
  return grants.map((g) => ({
    grantee_type: g.grantee_type,
    grantee_id: g.grantee_id,
    label:
      g.grantee_label?.trim() ||
      (g.grantee_type === "authenticated" ? "" : (g.grantee_id ?? "")),
    read: g.permissions.includes("r") || g.permissions.includes("m"),
    manage: g.permissions.includes("m"),
  }));
}

function describePolicy(policy: RowPolicyCondition[]): string {
  return policy
    .map((c) => {
      const right = c.claim
        ? `claim:${c.claim}`
        : Array.isArray(c.value)
          ? c.value.join(", ")
          : String(c.value ?? "");
      return c.op === "is_null" || c.op === "is_not_null"
        ? `${c.column} ${c.op}`
        : `${c.column} ${c.op} ${right}`;
    })
    .join(" AND ");
}

interface Props {
  resourceId: string;
  resourceName: string;
  rowPolicy: RowPolicyCondition[];
}

export function DataResourceAccessPanel({
  resourceId,
  resourceName,
  rowPolicy,
}: Props) {
  const { t } = useTranslation("ontology");
  const [rows, setRows] = useState<Row[]>([]);
  const [candidates, setCandidates] = useState<OwnerCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pick, setPick] = useState("");

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
    setSaving(true);
    try {
      await putResourceAcl(
        RESOURCE_TYPES.dataResource,
        resourceId,
        rows.map((r) => ({
          grantee_type: r.grantee_type,
          grantee_id: r.grantee_id,
          permissions: permsOf(r.read, r.manage),
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
        manage: false,
      },
    ]);
    setPick("");
  };

  return (
    <section className="data-resource-access">
      <header className="data-resource-access__header">
        <h3>{t("dataModel.resourceAccess")}</h3>
        <p className="page-subtitle">{t("dataModel.resourceAccessHint")}</p>
      </header>

      {/* The row conditions are part of the grant: approving "all Stock data" and "only
          semiconductor stocks" are different acts. */}
      <div className="data-resource-access__scope">
        <span className="data-resource-access__scope-label">
          {t("dataModel.resourceAccessScope")}
        </span>
        <code>
          {rowPolicy.length
            ? describePolicy(rowPolicy)
            : t("dataModel.resourceRowsNone")}
        </code>
      </div>

      {loading ? (
        <p className="page-subtitle">{t("shared.loading")}</p>
      ) : (
        <table className="data-resource-access__table">
          <thead>
            <tr>
              <th>{t("dataModel.resourceAccessGrantee")}</th>
              <th>{t("dataModel.resourceAccessRead")}</th>
              <th>{t("dataModel.resourceAccessManage")}</th>
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
                  <input
                    type="checkbox"
                    checked={row.manage}
                    aria-label={t("dataModel.resourceAccessManage")}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((r, i) =>
                          // manage implies read: someone who may change this list can also
                          // read what they are sharing.
                          i === index
                            ? {
                                ...r,
                                manage: e.target.checked,
                                read: e.target.checked ? true : r.read,
                              }
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
        <FormField label={t("dataModel.resourceAccessAdd")}>
          <select value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">{t("dataModel.resourceAccessPick")}</option>
            {candidates
              .filter((c) => !rows.some((r) => r.grantee_id === c.subject))
              .map((c) => (
                <option key={c.subject} value={c.subject}>
                  {c.label || c.subject}
                </option>
              ))}
          </select>
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
