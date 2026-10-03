import { SUPPORTED_LOCALES } from '@philax/types';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../app/AuthProvider';
import { isLocale } from '../lib/i18n';

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const { changeLocale } = useAuth();
  const id = useId();
  return (
    <div className="lang-switcher">
      <label htmlFor={id} className="px-visually-hidden">
        {t('language.label')}
      </label>
      <select
        id={id}
        className="lang-switcher__select"
        value={i18n.language}
        onChange={(e) => {
          if (isLocale(e.target.value)) void changeLocale(e.target.value);
        }}
      >
        {SUPPORTED_LOCALES.map((l) => (
          <option key={l} value={l} lang={l}>
            {t(`language.${l}`)}
          </option>
        ))}
      </select>
    </div>
  );
}
