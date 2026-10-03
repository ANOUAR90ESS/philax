import { VisuallyHidden } from './VisuallyHidden';

export function Spinner({ label }: { label: string }) {
  return (
    <span className="px-spinner-wrap" role="status">
      <span className="px-spinner" aria-hidden="true" />
      <VisuallyHidden>{label}</VisuallyHidden>
    </span>
  );
}
