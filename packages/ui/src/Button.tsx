import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  busy?: boolean;
  children: ReactNode;
}

/** Accessible button: native <button>, visible focus ring, aria-busy while working. */
export function Button({
  variant = 'primary',
  busy = false,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={['px-btn', `px-btn--${variant}`, className].filter(Boolean).join(' ')}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
    >
      {busy ? <span className="px-spinner px-spinner--inline" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
