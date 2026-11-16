/**
 * A list page of the Catalog: title and actions, the app's tab strip, an optional toolbar, the body.
 *
 * Five lists used to spell this out themselves — and drifted: one wrapped its table in the settings card,
 * another borrowed the ontology manager's API-name style for its name column, a third put its view switch
 * at a different size than the others' search boxes. The skeleton is one shape, so it is one component.
 */
import type { ReactNode } from 'react';

export function ListPage({
  title,
  subtitle,
  actions,
  tabs,
  toolbar,
  children,
}: {
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
    <div className="ontology-admin">
      {title || subtitle || actions ? (
        <header className="page-header">
          <div>
            {title ? <h1>{title}</h1> : null}
            {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
          </div>
          {actions ? <div className="page-header-actions">{actions}</div> : null}
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
