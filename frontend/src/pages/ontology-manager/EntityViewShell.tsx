import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
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

export function EntityViewShell({
  backTo,
  backLabel,
  title,
  meta,
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
        <h2 className="entity-view__title">{title}</h2>
        {meta != null && meta !== '' ? <p className="entity-view__meta">{meta}</p> : null}
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
        {(sectionTitle || toolbar) && (
          <header className="page-header">
            <div>
              {sectionTitle ? <h1>{sectionTitle}</h1> : null}
              {sectionSubtitle ? <p className="page-subtitle">{sectionSubtitle}</p> : null}
            </div>
            {toolbar ? <div className="entity-view__actions">{toolbar}</div> : null}
          </header>
        )}
        {children}
      </div>
    </div>
  );
}
