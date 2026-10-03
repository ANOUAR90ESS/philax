import { z } from 'zod';

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

export const SeedPerspectiveSchema = z.object({
  slug,
  label: z.string().min(1),
  description: z.string().min(20),
  assumptions: z.array(z.string().min(3)).min(1),
  values: z.array(z.string().min(2)).min(1),
  relevantDomains: z.array(z.string()).min(1),
  contrasts: z.array(slug),
});
export type SeedPerspective = z.infer<typeof SeedPerspectiveSchema>;

const knowledgeRef = {
  work: z.string(),
  locator: z.string().nullable(),
};

export const SeedCharacterSchema = z.object({
  slug,
  name: z.string().min(1),
  displayName: z.string().min(1),
  type: z.enum(['philosopher', 'scientist', 'writer', 'economist', 'thinker', 'school']),
  birthYear: z.number().int().nullable(),
  deathYear: z.number().int().nullable(),
  era: z.string().min(1),
  representation: z.enum(['historical', 'contemporary']),
  domains: z.array(z.string()).min(1),
  worldviewSummary: z.string().min(50),
  biography: z.string().min(50),
  perspectives: z.array(z.object({ slug, strength: z.number().int().min(1).max(3) })).min(1),
  works: z
    .array(z.object({ key: slug, title: z.string().min(1), year: z.number().int().nullable() }))
    .min(1),
  concepts: z
    .array(
      z.object({
        concept: z.string().min(1),
        description: z.string().min(20),
        kind: z.enum(['concept', 'scholarly_interpretation']),
        ...knowledgeRef,
      }),
    )
    .min(1),
  positions: z
    .array(
      z.object({
        topic: z.string().min(1),
        statement: z.string().min(20),
        kind: z.enum(['documented_position', 'scholarly_interpretation', 'interpretation']),
        ...knowledgeRef,
      }),
    )
    .min(2),
  relations: z.array(
    z.object({
      other: slug,
      relation: z.enum(['opposes', 'critiques', 'influenced_by', 'shares_tradition']),
      note: z.string().min(1),
    }),
  ),
  constraints: z.array(
    z.object({
      kind: z.enum(['never_claim', 'anachronism', 'tone', 'scope']),
      rule: z.string().min(10),
    }),
  ),
});
export type SeedCharacter = z.infer<typeof SeedCharacterSchema>;

/** Cross-file integrity checks the per-file schema cannot express. */
export function validateSeedGraph(
  perspectives: SeedPerspective[],
  characters: SeedCharacter[],
): string[] {
  const errors: string[] = [];
  const pSlugs = new Set(perspectives.map((p) => p.slug));
  const cSlugs = new Set(characters.map((c) => c.slug));
  if (pSlugs.size !== perspectives.length) errors.push('duplicate perspective slug');
  if (cSlugs.size !== characters.length) errors.push('duplicate character slug');
  for (const p of perspectives) {
    for (const c of p.contrasts)
      if (!pSlugs.has(c)) errors.push(`perspective ${p.slug}: unknown contrast ${c}`);
  }
  for (const c of characters) {
    const works = new Set(c.works.map((w) => w.key));
    for (const p of c.perspectives)
      if (!pSlugs.has(p.slug)) errors.push(`${c.slug}: unknown perspective ${p.slug}`);
    for (const r of c.relations)
      if (!cSlugs.has(r.other)) errors.push(`${c.slug}: unknown relation target ${r.other}`);
    for (const k of [...c.concepts, ...c.positions])
      if (!works.has(k.work)) errors.push(`${c.slug}: unknown work ${k.work}`);
    if (c.representation === 'contemporary' && c.deathYear !== null)
      errors.push(`${c.slug}: contemporary figure with deathYear`);
    if (c.representation === 'historical' && c.deathYear === null)
      errors.push(`${c.slug}: historical figure without deathYear`);
  }
  return errors;
}
