import { z } from 'zod';
import { KnowledgeKindSchema, SourceSchema } from './sources';

export const CHARACTER_TYPES = [
  'philosopher',
  'scientist',
  'writer',
  'economist',
  'thinker',
  'school',
] as const;
export const CharacterTypeSchema = z.enum(CHARACTER_TYPES);
export type CharacterType = z.infer<typeof CharacterTypeSchema>;

export const WorkSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  year: z.number().int().nullable(),
  sourceId: z.uuid().nullable(),
});
export type Work = z.infer<typeof WorkSchema>;

export const PositionSchema = z.object({
  id: z.uuid(),
  topic: z.string(),
  statement: z.string(),
  knowledgeKind: KnowledgeKindSchema,
  sourceId: z.uuid().nullable(),
  locator: z.string().nullable(),
});
export type Position = z.infer<typeof PositionSchema>;

export const CharacterConstraintSchema = z.object({
  kind: z.enum(['never_claim', 'anachronism', 'tone', 'scope']),
  rule: z.string(),
});
export type CharacterConstraint = z.infer<typeof CharacterConstraintSchema>;

export const CharacterCompatibilitySchema = z.object({
  otherCharacterId: z.uuid(),
  relation: z.enum(['opposes', 'critiques', 'influenced_by', 'shares_tradition']),
  note: z.string(),
});
export type CharacterCompatibility = z.infer<typeof CharacterCompatibilitySchema>;

/** How a figure may be represented (§12, §13). */
export const RepresentationModeSchema = z.enum(['historical', 'contemporary']);
export type RepresentationMode = z.infer<typeof RepresentationModeSchema>;

export const CharacterSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  displayName: z.string(),
  type: CharacterTypeSchema,
  birthYear: z.number().int().nullable(),
  deathYear: z.number().int().nullable(),
  era: z.string(),
  representation: RepresentationModeSchema,
  domains: z.array(z.string()),
  concepts: z.array(z.string()),
  worldviewSummary: z.string(),
  biography: z.string(),
  perspectiveSlugs: z.array(z.string()),
  knownPositions: z.array(PositionSchema),
  works: z.array(WorkSchema),
  sources: z.array(SourceSchema),
  compatibility: z.array(CharacterCompatibilitySchema),
  constraints: z.array(CharacterConstraintSchema),
});
export type Character = z.infer<typeof CharacterSchema>;

/** Lightweight public view used in debate payloads. */
export const CharacterSummarySchema = CharacterSchema.pick({
  id: true,
  slug: true,
  displayName: true,
  type: true,
  birthYear: true,
  deathYear: true,
  era: true,
  representation: true,
  worldviewSummary: true,
});
export type CharacterSummary = z.infer<typeof CharacterSummarySchema>;
