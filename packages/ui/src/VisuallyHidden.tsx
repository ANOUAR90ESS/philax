import type { ReactNode } from 'react';

export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="px-visually-hidden">{children}</span>;
}
