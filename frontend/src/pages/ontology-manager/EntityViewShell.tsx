import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { CheckRow, Metric, MetricGrid } from '../../styles/design-system';
import '../../styles/account-page.scss';
import './entity-view.scss';

export type EntityViewNavItem = {
  to: string;
  label: string;
  end?: boolean;
};

type EntityViewShellProps = {
  backTo: string;
  backLabel: string;
  title: string;
  meta?: ReactNode;
  kind?: string;
  navItems?: EntityViewNavItem[];
  children: ReactNode;
  toolbar?: ReactNode;
  sectionTitle?: string;
  sectionSubtitle?: ReactNode;
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
        <h1>{title}</h1>
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
  title,
  description,
  children,
  footer,
}: {
  title?: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="account-card entity-view__panel">
      {title || description ? (
        <div className="account-card-head">
          <div>
            {title ? <h2 className="account-card-title">{title}</h2> : null}
            {description ? <p className="account-card-desc">{description}</p> : null}
          </div>
        </div>
      ) : null}
      {children}
      {footer ? <div className="entity-view__panel-footer">{footer}</div> : null}
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

export function EntityViewCheck({
  checked,
  onChange,
  title,
  hint,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  hint?: ReactNode;
}) {
  return <CheckRow checked={checked} onChange={onChange} title={title} hint={hint} />;
}

export function EntityViewShell({
  backTo,
  backLabel,
  title,
  meta,
  kind,
  navItems = [],
  children,
  toolbar,
  sectionTitle,
  sectionSubtitle,
}: EntityViewShellProps) {
  const navigate = useNavigate();

  return (
    <div className="entity-view">
      <aside className="entity-view__sidebar">
        <button type="button" className="entity-view__back" onClick={() => navigate(backTo)}>
          <ArrowLeft size={16} aria-hidden />
          {backLabel}
        </button>
        <div className="entity-view__identity">
          {kind ? <span className="account-pill account-pill--accent">{kind}</span> : null}
          <h2 className="entity-view__title">{title}</h2>
          {meta != null && meta !== '' ? <p className="entity-view__meta">{meta}</p> : null}
        </div>
        {navItems.length > 0 ? (
          <nav className="entity-view__nav">
            {navItems.map((item) => (
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
            ))}
          </nav>
        ) : null}
      </aside>
      <div className="entity-view__main">
        <div className="entity-view__main-inner account-stack">
          {(sectionTitle || toolbar) && (
            <EntityViewHeader title={sectionTitle || ''} subtitle={sectionSubtitle} actions={toolbar} />
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
