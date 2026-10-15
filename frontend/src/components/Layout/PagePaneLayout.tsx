import { Outlet } from 'react-router-dom';

/**
 * Route layout for entity detail pages that fill the window and own their scrolling.
 *
 * The entity shell (`entity-view.scss`) expects a `.app-page-pane` parent: it supplies the page
 * gutter and the scroll container, so the shell only scrolls its own `__main`. The ontology suite
 * gets one from `OntologySection`; the data-layer detail routes (datasets, semantic models) have no
 * second-level rail, so they use this.
 */
export function PagePaneLayout() {
  return (
    <div className="app-page-pane">
      <Outlet />
    </div>
  );
}
