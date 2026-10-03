import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Db } from '../client';
import { seedId } from './deterministic-id';
import {
  SeedCharacterSchema,
  SeedPerspectiveSchema,
  validateSeedGraph,
  type SeedCharacter,
  type SeedPerspective,
} from './schema';

export interface SeedData {
  perspectives: SeedPerspective[];
  characters: SeedCharacter[];
}

export interface SeedResult {
  perspectives: number;
  characters: number;
  sources: number;
  chunks: number;
  retiredChunks: number;
}

export async function readSeedData(dir: string): Promise<SeedData> {
  const perspectives = SeedPerspectiveSchema.array().parse(
    JSON.parse(await readFile(join(dir, 'perspectives.json'), 'utf8')),
  );
  const files = (await readdir(join(dir, 'characters'))).filter((f) => f.endsWith('.json')).sort();
  const characters: SeedCharacter[] = [];
  for (const f of files) {
    const parsed = SeedCharacterSchema.safeParse(
      JSON.parse(await readFile(join(dir, 'characters', f), 'utf8')),
    );
    if (!parsed.success) throw new Error(`Invalid seed file ${f}: ${parsed.error.message}`);
    characters.push(parsed.data);
  }
  const errors = validateSeedGraph(perspectives, characters);
  if (errors.length) throw new Error(`Seed integrity errors:\n${errors.join('\n')}`);
  return { perspectives, characters };
}

interface ChunkSpec {
  id: string;
  sourceId: string;
  characterId: string;
  ordinal: number;
  content: string;
  kind: string;
  locator: string | null;
}

/**
 * Idempotently loads curated knowledge. Ids are deterministic; chunks whose text
 * changed get new ids and the old ones are retired (not deleted) so existing
 * debate citations remain intact.
 */
export async function loadSeed(db: Db, data: SeedData): Promise<SeedResult> {
  return db.transaction(async (tx) => {
    const result: SeedResult = {
      perspectives: 0,
      characters: 0,
      sources: 0,
      chunks: 0,
      retiredChunks: 0,
    };

    for (const p of data.perspectives) {
      await tx.query(
        `INSERT INTO perspectives (id, slug, label, description, assumptions, "values", relevant_domains, contrasts)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (slug) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description,
           assumptions = EXCLUDED.assumptions, "values" = EXCLUDED."values",
           relevant_domains = EXCLUDED.relevant_domains, contrasts = EXCLUDED.contrasts`,
        [
          seedId('perspective', p.slug),
          p.slug,
          p.label,
          p.description,
          p.assumptions,
          p.values,
          p.relevantDomains,
          p.contrasts,
        ],
      );
      result.perspectives++;
    }

    // Characters first (relations reference each other).
    for (const c of data.characters) {
      await tx.query(
        `INSERT INTO characters (id, slug, name, display_name, type, birth_year, death_year, era, representation,
           worldview_summary, biography, domains)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, display_name = EXCLUDED.display_name,
           type = EXCLUDED.type, birth_year = EXCLUDED.birth_year, death_year = EXCLUDED.death_year,
           era = EXCLUDED.era, representation = EXCLUDED.representation,
           worldview_summary = EXCLUDED.worldview_summary, biography = EXCLUDED.biography,
           domains = EXCLUDED.domains, is_active = true, updated_at = now()`,
        [
          characterId(c.slug),
          c.slug,
          c.name,
          c.displayName,
          c.type,
          c.birthYear,
          c.deathYear,
          c.era,
          c.representation,
          c.worldviewSummary,
          c.biography,
          c.domains,
        ],
      );
      result.characters++;
    }

    for (const c of data.characters) {
      const cid = characterId(c.slug);
      for (const table of [
        'works',
        'character_concepts',
        'character_positions',
        'character_perspectives',
        'character_relations',
        'character_constraints',
      ]) {
        await tx.query(`DELETE FROM ${table} WHERE character_id = $1`, [cid]);
      }

      // Sources: one curated profile + one per work.
      const profileSlug = `${c.slug}--profile`;
      const profileId = await upsertSource(tx, {
        slug: profileSlug,
        title: `Philax curated profile: ${c.displayName}`,
        author: null,
        publisher: 'Philax knowledge curation',
        publishedAt: null,
        sourceType: 'secondary',
        notes:
          'Summary compiled by the Philax curators from standard reference works; individual claims pending citation verification.',
      });
      result.sources++;
      const workSource = new Map<string, string>();
      for (const w of c.works) {
        const sid = await upsertSource(tx, {
          slug: `${c.slug}--${w.key}`,
          title: w.title,
          author: c.name,
          publisher: null,
          publishedAt: w.year === null ? null : String(w.year),
          sourceType: 'primary',
          notes: 'Bibliographic reference; URL intentionally omitted until verified by a curator.',
        });
        workSource.set(w.key, sid);
        result.sources++;
        await tx.query(
          `INSERT INTO works (id, character_id, title, year, source_id) VALUES ($1, $2, $3, $4, $5)`,
          [seedId('work', c.slug, w.key), cid, w.title, w.year, sid],
        );
      }

      const chunks: ChunkSpec[] = [];
      const addChunk = (
        sourceId: string,
        content: string,
        kind: string,
        locator: string | null,
      ) => {
        const ordinal = chunks.filter((x) => x.sourceId === sourceId).length;
        chunks.push({
          id: seedId('chunk', sourceId, content, kind, locator ?? ''),
          sourceId,
          characterId: cid,
          ordinal,
          content,
          kind,
          locator,
        });
        return chunks[chunks.length - 1] as ChunkSpec;
      };
      addChunk(
        profileId,
        `Biography of ${c.displayName}: ${c.biography}`,
        'biographical_fact',
        null,
      );
      addChunk(
        profileId,
        `Worldview of ${c.displayName}: ${c.worldviewSummary}`,
        'scholarly_interpretation',
        null,
      );
      const conceptChunks = c.concepts.map((k) =>
        addChunk(
          workSource.get(k.work) as string,
          `${k.concept}: ${k.description}`,
          k.kind,
          k.locator,
        ),
      );
      const positionChunks = c.positions.map((p) =>
        addChunk(workSource.get(p.work) as string, `${p.topic}: ${p.statement}`, p.kind, p.locator),
      );

      result.retiredChunks += await syncChunks(tx, [profileId, ...workSource.values()], chunks);
      result.chunks += chunks.length;

      for (const [i, k] of c.concepts.entries()) {
        await tx.query(
          `INSERT INTO character_concepts (character_id, concept, description, source_id, locator, chunk_id) VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            cid,
            k.concept,
            k.description,
            workSource.get(k.work) as string,
            k.locator,
            (conceptChunks[i] as ChunkSpec).id,
          ],
        );
      }
      for (const [i, p] of c.positions.entries()) {
        await tx.query(
          `INSERT INTO character_positions (id, character_id, topic, statement, knowledge_kind, source_id, locator, chunk_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            seedId('position', c.slug, p.topic),
            cid,
            p.topic,
            p.statement,
            p.kind,
            workSource.get(p.work) as string,
            p.locator,
            (positionChunks[i] as ChunkSpec).id,
          ],
        );
      }
      for (const p of c.perspectives) {
        await tx.query(
          `INSERT INTO character_perspectives (character_id, perspective_id, strength) VALUES ($1, $2, $3)`,
          [cid, seedId('perspective', p.slug), p.strength],
        );
      }
      for (const r of c.relations) {
        await tx.query(
          `INSERT INTO character_relations (character_id, other_character_id, relation, note) VALUES ($1, $2, $3, $4)`,
          [cid, characterId(r.other), r.relation, r.note],
        );
      }
      for (const [i, k] of c.constraints.entries()) {
        await tx.query(
          `INSERT INTO character_constraints (id, character_id, kind, rule) VALUES ($1, $2, $3, $4)`,
          [seedId('constraint', c.slug, String(i)), cid, k.kind, k.rule],
        );
      }
    }
    return result;
  });
}

export function characterId(slug: string): string {
  return seedId('character', slug);
}

async function upsertSource(
  tx: Db,
  s: {
    slug: string;
    title: string;
    author: string | null;
    publisher: string | null;
    publishedAt: string | null;
    sourceType: string;
    notes: string;
  },
): Promise<string> {
  const id = seedId('source', s.slug);
  await tx.query(
    `INSERT INTO sources (id, slug, title, author, publisher, published_at, source_type, origin, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'seed', $8)
     ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, author = EXCLUDED.author, publisher = EXCLUDED.publisher,
       published_at = EXCLUDED.published_at, source_type = EXCLUDED.source_type, notes = EXCLUDED.notes`,
    [id, s.slug, s.title, s.author, s.publisher, s.publishedAt, s.sourceType, s.notes],
  );
  return id;
}

/** Inserts new chunks, reactivates unchanged ones and retires chunks no longer in the seed. */
async function syncChunks(tx: Db, sourceIds: string[], chunks: ChunkSpec[]): Promise<number> {
  const keep = chunks.map((c) => c.id);
  // Free ordinals of chunks being retired so the (source_id, ordinal) unique key never collides.
  const { rowCount } = await tx.query(
    `UPDATE source_chunks SET retired_at = COALESCE(retired_at, now()), ordinal = -abs(hashtext(id::text)) - 1
     WHERE source_id = ANY($1::uuid[]) AND NOT (id = ANY($2::uuid[])) AND (retired_at IS NULL OR ordinal >= 0)`,
    [sourceIds, keep],
  );
  // Temporarily move active ordinals out of the way, then write final ordinals.
  await tx.query(
    `UPDATE source_chunks SET ordinal = -ordinal - 1000000 WHERE id = ANY($1::uuid[])`,
    [keep],
  );
  for (const c of chunks) {
    await tx.query(
      `INSERT INTO source_chunks (id, source_id, character_id, ordinal, content, knowledge_kind, locator, fts_config)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'english')
       ON CONFLICT (id) DO UPDATE SET ordinal = EXCLUDED.ordinal, retired_at = NULL`,
      [c.id, c.sourceId, c.characterId, c.ordinal, c.content, c.kind, c.locator],
    );
  }
  return rowCount;
}
