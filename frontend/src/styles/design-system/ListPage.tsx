/**
 * A list page of the Catalog: title and actions, the app's tab strip, an optional toolbar, the body.
 *
 * Five lists used to spell this out themselves — and drifted: one wrapped its table in the settings card,
 * another borrowed the ontology manager's API-name style for its name column, a third put its view switch
 * at a different size than the others' search boxes. The skeleton is one shape, so it is one component.
 */
import type { ReactNode } from "react";

export function ListPage({
  className,
  headerClassName,
  title,
  subtitle,
  actions,
  tabs,
  toolbar,
  children,
}: {
  /** A modifier for the page root (`function-editor-list` and friends). */
  className?: string;
  /** A modifier for the header (`model-page-header` and friends). */
  headerClassName?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** The app-level tab strip (`DatasetAppTabs`), when the page has one. */
  tabs?: ReactNode;
  /** Search, filters, a view switch — one row above the table. */
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className={className ? `ds-page ${className}` : "ds-page"}
    >
      {title || subtitle || actions ? (
        <header
          className={`page-header${headerClassName ? ` ${headerClassName}` : ""}`}
        >
          <div>
            {title ? <h1>{title}</h1> : null}
            {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
          </div>
          {actions ? (
            <div className="page-header-actions">{actions}</div>
          ) : null}
        </header>
      ) : null}
      {tabs}
      <div className="ds-list-page__body">
        {toolbar ? <div className="ds-list-toolbar">{toolbar}</div> : null}
        {children}
      </div>
    </div>
  );
}
