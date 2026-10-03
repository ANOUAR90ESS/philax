import { SUPPORTED_LOCALES, type Locale } from '@philax/types';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ar from '../locales/ar.json';
import en from '../locales/en.json';
import es from '../locales/es.json';

const RTL_LOCALES: ReadonlySet<Locale> = new Set(['ar']);
const STORAGE_KEY = 'philax.locale';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function directionFor(locale: Locale): 'rtl' | 'ltr' {
  return RTL_LOCALES.has(locale) ? 'rtl' : 'ltr';
}

function readStoredLocale(): Locale | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isLocale(v) ? v : null;
  } catch {
    return null;
  }
}

export function detectLocale(): Locale {
  const stored = readStoredLocale();
  if (stored) return stored;
  for (const lang of navigator.languages ?? [navigator.language]) {
    const base = lang.slice(0, 2).toLowerCase();
    if (isLocale(base)) return base;
  }
  return 'en';
}

/** Applies lang/dir to <html> so the whole layout mirrors for RTL locales. */
export function applyDocumentLocale(locale: Locale): void {
  document.documentElement.lang = locale;
  document.documentElement.dir = directionFor(locale);
}

export async function setLocale(locale: Locale): Promise<void> {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Storage may be unavailable (private mode); locale still applies for this session.
  }
  applyDocumentLocale(locale);
  await i18n.changeLanguage(locale);
}

export function initI18n(locale: Locale = detectLocale()) {
  applyDocumentLocale(locale);
  void i18n.use(initReactI18next).init({
    resources: { en: { translation: en }, es: { translation: es }, ar: { translation: ar } },
    lng: locale,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  return i18n;
}
