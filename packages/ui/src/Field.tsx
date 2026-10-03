import { useId, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';

interface FieldBase {
  label: string;
  hint?: string;
  error?: string | null;
  hideLabel?: boolean;
}

export function TextField({
  label,
  hint,
  error,
  hideLabel,
  id,
  ...rest
}: FieldBase & InputHTMLAttributes<HTMLInputElement>) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  return (
    <div className="px-field">
      <label htmlFor={fieldId} className={hideLabel ? 'px-visually-hidden' : 'px-field__label'}>
        {label}
      </label>
      <input
        id={fieldId}
        className="px-input"
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        {...rest}
      />
      {hint ? (
        <p id={hintId} className="px-field__hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="px-field__error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextArea({
  label,
  hint,
  error,
  hideLabel,
  id,
  ...rest
}: FieldBase & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  return (
    <div className="px-field">
      <label htmlFor={fieldId} className={hideLabel ? 'px-visually-hidden' : 'px-field__label'}>
        {label}
      </label>
      <textarea
        id={fieldId}
        className="px-input px-textarea"
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        {...rest}
      />
      {hint ? (
        <p id={hintId} className="px-field__hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="px-field__error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
