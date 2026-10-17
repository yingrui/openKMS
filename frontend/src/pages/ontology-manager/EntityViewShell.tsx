import { useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronDown, Loader2 } from 'lucide-react';
import { useActiveSection } from '../../hooks/useActiveSection';
import { Metric, MetricGrid } from '../../styles/design-system';
import '../../styles/account-page.scss';
import '../../styles/entity-view.scss';

export type EntityViewNavItem = {
  /** A route — the usual case (a tab). */
  to?: string;
  /** …or a section of *this* page: the link scrolls to the element with this id (a document's own
   * table of contents, which is what this rail is for on a page without tabs). */
  sectionId?: string;
  label: string;
  /** A second line under the label — where a finding's numbers come from, say. */
  hint?: string;
  end?: boolean;
};

type EntityViewShellProps = {
  backTo: string;
  backLabel: string;
  title: string;
  meta?: ReactNode;
  /**
   * Identity-level items, on one quiet row under the meta: facts (a status chip, a count) and the
   * action that belongs with them — a read action like "View YAML", or a destructive one that must
   * not sit beside the primary action (add `className="is-danger"` so it says so on hover).
   */
  identityAction?: ReactNode;
  navItems?: EntityViewNavItem[];
  children: ReactNode;
};

export function EntityViewLoading({ label }: { label: string }) {
  return (
    <p className="ontology-admin-loading">
      <Loader2 className="spin" size={18} aria-hidden /> {label}
    </p>
  );
}

/** Page-level tab header — uses app-shell `.page-header` (not PanelToolbar split chrome). */
export function EntityViewHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        {/* A shell-level toolbar has actions but no section title — do not render an empty h1. */}
        {title ? <h1>{title}</h1> : null}
        {subtitle != null && subtitle !== '' ? <p className="page-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="entity-view__actions">{actions}</div> : null}
    </header>
  );
}

export function EntityViewStats({ children }: { children: ReactNode }) {
  return <MetricGrid>{children}</MetricGrid>;
}

export function EntityViewStat({ label, value }: { label: string; value: ReactNode }) {
  return <Metric label={label} value={value} />;
}

/** Section card — reuses shared `.account-card` surface from account-page styles. */
export function EntityViewPanel({
  id,
  title,
  description,
  actions,
  children,
  footer,
  defaultCollapsed = false,
}: {
  /** An anchor target — a story's table of contents links to its sections by id. */
  id?: string;
  title?: string;
  description?: ReactNode;
  /** What acts on the section (edit / reorder / remove): it sits in the head, not above the card. */
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** When true, body starts collapsed (title row toggles). Requires a title. */
  defaultCollapsed?: boolean;
}) {
  const collapsible = defaultCollapsed && !!title;
  const [open, setOpen] = useState(!defaultCollapsed);

  return (
    <section id={id} className="account-card entity-view__panel">
      {title || description || actions ? (
        <div className="account-card-head">
          {collapsible ? (
            <button
              type="button"
              className="entity-view__panel-toggle"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              <div>
                {title ? <h2 className="account-card-title">{title}</h2> : null}
                {description && open ? <p className="account-card-desc">{description}</p> : null}
              </div>
              <ChevronDown
                size={18}
                className={`entity-view__panel-chevron${open ? ' is-open' : ''}`}
                aria-hidden
              />
            </button>
          ) : (
            <div>
              {title ? <h2 className="account-card-title">{title}</h2> : null}
              {description ? <p className="account-card-desc">{description}</p> : null}
            </div>
          )}
          {actions ? <div className="entity-view__panel-actions">{actions}</div> : null}
        </div>
      ) : null}
      {open ? (
        <>
          {children}
          {footer ? <div className="entity-view__panel-footer">{footer}</div> : null}
        </>
      ) : null}
    </section>
  );
}

/** Form field — reuses shared `.account-field` / `.account-field-label`. */
export function EntityViewField({
  label,
  hint,
  children,
  as = 'label',
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  as?: 'label' | 'div';
}) {
  const Tag = as;
  return (
    <Tag className="account-field">
      <span className="account-field-label">{label}</span>
      {children}
      {hint ? <span className="account-hint">{hint}</span> : null}
    </Tag>
  );
}

export function EntityViewShell({
  backTo,
  backLabel,
  title,
  meta,
  identityAction,
  navItems = [],
  children,
}: EntityViewShellProps) {
  const navigate = useNavigate();
  /* A section item scrolls the pane; this makes the rail follow along while the reader scrolls it. */
  const sectionIds = navItems
    .map((item) => item.sectionId)
    .filter((id): id is string => typeof id === 'string');
  const { active: activeSection, markActive } = useActiveSection(sectionIds);

  return (
    <div className="entity-view">
      <aside className="entity-view__sidebar">
        <button type="button" className="entity-view__back" onClick={() => navigate(backTo)}>
          <ArrowLeft size={16} aria-hidden />
          {backLabel}
        </button>
        <div className="entity-view__identity">
          <h2 className="entity-view__title">{title}</h2>
          {meta != null && meta !== '' ? <p className="entity-view__meta">{meta}</p> : null}
          {identityAction ? (
            <div className="entity-view__identity-action">{identityAction}</div>
          ) : null}
        </div>
        {navItems.length > 0 ? (
          <nav className="entity-view__nav">
            {navItems.map((item) => (
              item.to ? (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `entity-view__nav-item${isActive ? ' entity-view__nav-item--active' : ''}`
                  }
                >
                  {item.label}
                </NavLink>
              ) : (
                <a
                  key={item.sectionId}
                  className={`entity-view__nav-item${
                    activeSection === item.sectionId ? ' entity-view__nav-item--active' : ''
                  }`}
                  aria-current={activeSection === item.sectionId ? 'true' : undefined}
                  href={`#${item.sectionId}`}
                  onClick={(event) => {
                    /* The scrolling box is the main pane, not the document (the shell pins it), so a
                       hash jump is not reliable — move the pane itself and keep the URL clean. */
                    const target = event.currentTarget.ownerDocument.getElementById(
                      item.sectionId ?? '',
                    );
                    if (!target) return;
                    event.preventDefault();
                    markActive(item.sectionId ?? '');
                    target.scrollIntoView({ block: 'start', behavior: 'smooth' });
                  }}
                >
                  {item.label}
                  {item.hint ? <span className="entity-view__nav-item-hint">{item.hint}</span> : null}
                </a>
              )
            ))}
          </nav>
        ) : null}
      </aside>
      <div className="entity-view__main">
        <div className="entity-view__main-inner account-stack">{children}</div>
      </div>
    </div>
  );
}
