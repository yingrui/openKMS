import type { ReactNode } from 'react';

type PanelToolbarProps = {
  leading?: ReactNode;
  tabs?: ReactNode;
  actions?: ReactNode;
  className?: string;
  as?: 'h2' | 'div';
  id?: string;
};

/** Shared panel chrome: optional leading title, tabs, and trailing actions. */
export function PanelToolbar({
  leading,
  tabs,
  actions,
  className,
  as: Tag = 'h2',
  id,
}: PanelToolbarProps) {
  return (
    <Tag id={id} className={['ds-panel-toolbar', className].filter(Boolean).join(' ')}>
      {leading ? <div className="ds-panel-toolbar__leading">{leading}</div> : null}
      {tabs ? <div className="ds-panel-toolbar__tabs">{tabs}</div> : null}
      {actions ? <div className="ds-panel-toolbar__actions">{actions}</div> : null}
    </Tag>
  );
}
