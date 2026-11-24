import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ListPage } from "../../styles/design-system";
import { Loader2, Pencil } from "lucide-react";
import { useOntologyFunctionsList } from "./useOntologyFunctionsList";
import "../ontology/ontology-admin.scss";
import "./function-editor.scss";

type Authoring = 'code' | 'logic';

/**
 * One list for both authoring modes — `source` is the only difference.
 *
 * The registry is shared (same table, same versions, same call surface), so two pages would be two copies of this
 * table that drift. The Logic functions entry exists to *find* those functions, not to invent a second artifact.
 */
export function FunctionEditorListPage() {
  const { t } = useTranslation("ontology");
  const location = useLocation();
  const source: Authoring = location.pathname.endsWith("/logic") ? "logic" : "code";
  const { items, loading } = useOntologyFunctionsList(source);
  const isLogic = source === "logic";

  return (
    <ListPage
      className="function-editor-list"
      title={isLogic ? t("editor.logicTitle") : t("editor.title")}
      subtitle={isLogic ? t("editor.logicSubtitle") : t("editor.subtitle")}
      actions={
        // Each list creates its own kind: the entry decides the authoring mode, so the button never asks "which".
        <Link
          to={isLogic ? "/function-editor/new?kind=logic" : "/function-editor/new"}
          className="btn btn-primary"
        >
          {isLogic ? t("editor.createLogic") : t("editor.create")}
        </Link>
      }
    >
      <div className="ds-table-wrap">
        {loading ? (
          <div className="ds-loading">
            <Loader2 size={32} className="ds-loading__spinner" aria-hidden />
            <p>{t("shared.loading")}</p>
          </div>
        ) : (
          <table className="ds-table">
            <thead>
              <tr>
                <th>{t("functions.apiName")}</th>
                <th>{t("functions.displayName")}</th>
                <th>{t("functions.latestVersion")}</th>
                <th>{t("functions.publishedVersion")}</th>
                <th className="ds-table-actions">{t("shared.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="ds-table-empty">
                    {isLogic ? (
                      <>
                        {t("editor.logicEmpty")}{" "}
                        <Link to="/function-editor/new?kind=logic">{t("editor.createLogic")}</Link>
                      </>
                    ) : (
                      <>
                        {t("editor.emptyList")}{" "}
                        <Link to="/function-editor/new">{t("editor.create")}</Link>
                      </>
                    )}
                  </td>
                </tr>
              ) : (
                items.map((fn) => (
                  <tr key={fn.id}>
                    <td>
                      <Link
                        to={`/function-editor/${fn.id}`}
                        className="function-editor-list__api-link"
                      >
                        {fn.api_name}
                      </Link>
                    </td>
                    <td>{fn.display_name}</td>
                    <td className="ds-table-muted">
                      {fn.latest_version ?? "—"}
                    </td>
                    <td className="ds-table-muted">
                      {fn.published_version ?? "—"}
                    </td>
                    <td className="ds-table-actions">
                      <div className="ds-table-btns">
                        <Link
                          to={`/function-editor/${fn.id}`}
                          className="ds-table-icon-link"
                          aria-label={t("editor.editFunction", {
                            name: fn.display_name || fn.api_name,
                          })}
                        >
                          <Pencil size={16} aria-hidden />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </ListPage>
  );
}
