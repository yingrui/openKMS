import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  type ReactElement,
  type ReactNode,
} from 'react';

export type FormFieldProps = {
  label: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  /** Override the generated control id (must match the control if you set id yourself). */
  htmlFor?: string;
  className?: string;
};

/** Label + control stack. Children are text inputs / selects / textareas (styled via `.ds-field`). */
export function FormField({ label, children, hint, htmlFor, className }: FormFieldProps) {
  const autoId = useId();
  const id = htmlFor ?? autoId;

  const control = Children.map(children, (child) => {
    if (!isValidElement(child)) return child;
    const el = child as ReactElement<{ id?: string }>;
    return cloneElement(el, { id: el.props.id ?? id });
  });

  return (
    <div className={['ds-field', className].filter(Boolean).join(' ')}>
      <label className="ds-field__label" htmlFor={id}>
        {label}
      </label>
      {control}
      {hint != null && hint !== '' ? <span className="ds-field__hint">{hint}</span> : null}
    </div>
  );
}
