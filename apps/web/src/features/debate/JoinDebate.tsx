import { Button, TextArea } from '@philax/ui';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

export function JoinDebate({
  busy,
  invite,
  onSend,
}: {
  busy: boolean;
  invite: boolean;
  onSend(content: string): Promise<void>;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const content = value.trim();
    if (content.length < 2) return;
    await onSend(content);
    setValue('');
  }

  return (
    <section className="join" aria-labelledby="join-title">
      <h2 id="join-title">{t('debate.join.title')}</h2>
      <p className="px-muted">{invite ? t('debate.join.invite') : t('debate.join.intro')}</p>
      <form onSubmit={submit} className="stack">
        <TextArea
          label={t('debate.join.label')}
          placeholder={t('debate.join.placeholder')}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={2000}
          rows={3}
          disabled={busy}
        />
        <div>
          <Button type="submit" variant="secondary" busy={busy} disabled={value.trim().length < 2}>
            {t('debate.join.send')}
          </Button>
        </div>
      </form>
    </section>
  );
}
