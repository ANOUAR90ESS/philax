import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <section className="narrow stack">
      <h1>{t('errors.notFound')}</h1>
      <Link to="/">{t('nav.home')}</Link>
    </section>
  );
}
