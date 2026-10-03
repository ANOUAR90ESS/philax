import { z } from 'zod';

export const UuidSchema = z.uuid();
export type Uuid = z.infer<typeof UuidSchema>;

/** UI locales shipped in the MVP. Content language may be any BCP-47 tag. */
export const SUPPORTED_LOCALES = ['en', 'es', 'ar'] as const;
export const LocaleSchema = z.enum(SUPPORTED_LOCALES);
export type Locale = z.infer<typeof LocaleSchema>;

export const LanguageTagSchema = z
  .string()
  .min(2)
  .max(35)
  .regex(/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/, 'Expected a BCP-47 language tag');

export const IsoDateTimeSchema = z.iso.datetime({ offset: true });
