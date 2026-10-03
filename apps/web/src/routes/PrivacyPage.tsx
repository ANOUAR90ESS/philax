import { useTranslation } from 'react-i18next';

export function PrivacyPage() {
  const { t } = useTranslation();
  const paragraphs = t('privacy.body', { returnObjects: true }) as string[];
  return (
    <article className="narrow prose">
      <h1>{t('privacy.title')}</h1>
      {paragraphs.map((p) => (
        <p key={p}>{p}</p>
      ))}
    </article>
  );
}
