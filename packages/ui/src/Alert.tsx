import type { ReactNode } from 'react';

export interface AlertProps {
  tone?: 'info' | 'error' | 'notice';
  title?: string;
  children: ReactNode;
}

export function Alert({ tone = 'info', title, children }: AlertProps) {
  return (
    <div className={`px-alert px-alert--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {title ? <p className="px-alert__title">{title}</p> : null}
      <div>{children}</div>
    </div>
  );
}
