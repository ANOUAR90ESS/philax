import { Alert } from '@philax/ui';
import { useTranslation } from 'react-i18next';
import { ApiClientError } from '../api/client';

/** User-friendly error with the internal error id for support (§54). */
export function ErrorMessage({ error }: { error: unknown }) {
  const { t } = useTranslation();
  const code = error instanceof ApiClientError ? error.code : 'INTERNAL';
  const errorId = error instanceof ApiClientError ? error.errorId : null;
  return (
    <Alert tone="error" title={t('errors.title')}>
      <p className="px-m0">
        {t(`errors.codes.${code}`, { defaultValue: t('errors.codes.INTERNAL') })}
      </p>
      {errorId ? (
        <p className="px-muted px-small px-m0">{t('errors.reference', { id: errorId })}</p>
      ) : null}
    </Alert>
  );
}
