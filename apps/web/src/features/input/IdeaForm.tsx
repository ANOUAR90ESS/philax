import { MAX_TEXT_INPUT_CHARS } from '@philax/types';
import { Button, TextArea } from '@philax/ui';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorMessage } from '../../components/ErrorMessage';
import { detectInput } from './detect-input';

interface IdeaFormProps {
  label: string;
  placeholder: string;
  hint?: string;
  submitLabel: string;
  initialValue?: string;
  maxLength?: number;
  detectUrls?: boolean;
  onSubmit(value: string): Promise<void>;
}

export function IdeaForm({
  label,
  placeholder,
  hint,
  submitLabel,
  initialValue = '',
  maxLength = MAX_TEXT_INPUT_CHARS,
  detectUrls = true,
  onSubmit,
}: IdeaFormProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const isUrl = detectUrls && detectInput(value).type === 'url';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (value.trim().length < 3) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(value);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <form className="idea-form stack" onSubmit={handleSubmit}>
      <TextArea
        label={label}
        hideLabel
        placeholder={placeholder}
        hint={isUrl ? t('home.detectedUrl') : hint}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={maxLength}
        rows={4}
        required
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.currentTarget.form?.requestSubmit();
          }
        }}
      />
      {error ? <ErrorMessage error={error} /> : null}
      <div>
        <Button type="submit" busy={busy} disabled={value.trim().length < 3}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
