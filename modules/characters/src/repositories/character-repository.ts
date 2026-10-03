import type { Db } from '@philax/database';
import type {
  Character,
  CharacterSummary,
  Position,
  Work,
  Source,
  CharacterCompatibility,
  CharacterConstraint,
} from '@philax/types';

/** Candidate row used by the selection algorithm (no heavy text). */
export interface CharacterCandidate {
  id: string;
  slug: string;
  displayName: string;
  representation: 'historical' | 'contemporary';
  deathYear: number | null;
  domains: string[];
  concepts: string[];
  perspectives: { slug: string; strength: number }[];
  positionCount: number;
  primarySourceCount: number;
  sourceCount: number;
  relations: { otherId: string; relation: string }[];
}

const SUMMARY = `c.id, c.slug, c.display_name AS "displayName", c.type, c.birth_year AS "birthYear",
  c.death_year AS "deathYear", c.era, c.representation, c.worldview_summary AS "worldviewSummary"`;

export class CharacterRepository {
  constructor(private readonly db: Db) {}

  async listCandidates(): Promise<CharacterCandidate[]> {
    const { rows } = await this.db.query<CharacterCandidate>(
      `SELECT c.id, c.slug, c.display_name AS "displayName", c.representation, c.death_year AS "deathYear", c.domains,
        COALESCE((SELECT array_agg(cc.concept ORDER BY cc.concept) FROM character_concepts cc WHERE cc.character_id = c.id), '{}') AS concepts,
        COALESCE((SELECT json_agg(json_build_object('slug', p.slug, 'strength', cp.strength) ORDER BY cp.strength DESC, p.slug)
          FROM character_perspectives cp JOIN perspectives p ON p.id = cp.perspective_id WHERE cp.character_id = c.id), '[]') AS perspectives,
        (SELECT count(*)::int FROM character_positions p WHERE p.character_id = c.id) AS "positionCount",
        (SELECT count(DISTINCT s.id)::int FROM works w JOIN sources s ON s.id = w.source_id WHERE w.character_id = c.id AND s.source_type = 'primary') AS "primarySourceCount",
        (SELECT count(DISTINCT ch.source_id)::int FROM source_chunks ch WHERE ch.character_id = c.id AND ch.retired_at IS NULL) AS "sourceCount",
        COALESCE((SELECT json_agg(json_build_object('otherId', r.other_character_id, 'relation', r.relation))
          FROM character_relations r WHERE r.character_id = c.id), '[]') AS relations
       FROM characters c WHERE c.is_active ORDER BY c.slug`,
    );
    return rows;
  }

  async getSummaries(ids: string[]): Promise<CharacterSummary[]> {
    if (ids.length === 0) return [];
    const { rows } = await this.db.query<CharacterSummary>(
      `SELECT ${SUMMARY} FROM characters c WHERE c.id = ANY($1::uuid[])`,
      [ids],
    );
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.flatMap((id) => (byId.has(id) ? [byId.get(id) as CharacterSummary] : []));
  }

  /** Loads the full knowledge entity for prompt construction and consistency checks. */
  async getFull(id: string): Promise<Character | null> {
    const { rows } = await this.db.query<
      Omit<
        Character,
        | 'knownPositions'
        | 'works'
        | 'sources'
        | 'compatibility'
        | 'constraints'
        | 'perspectiveSlugs'
        | 'concepts'
      > & { name: string }
    >(`SELECT ${SUMMARY}, c.name, c.biography, c.domains FROM characters c WHERE c.id = $1`, [id]);
    const base = rows[0];
    if (!base) return null;
    const [positions, works, sources, relations, constraints, perspectives, concepts] =
      await Promise.all([
        this.db.query<Position>(
          `SELECT id, topic, statement, knowledge_kind AS "knowledgeKind", source_id AS "sourceId", locator
         FROM character_positions WHERE character_id = $1 ORDER BY topic`,
          [id],
        ),
        this.db.query<Work>(
          `SELECT id, title, year, source_id AS "sourceId" FROM works WHERE character_id = $1 ORDER BY year NULLS LAST, title`,
          [id],
        ),
        this.db.query<Source>(
          `SELECT DISTINCT s.id, s.title, s.author, s.publisher, s.url, s.published_at AS "publishedAt", s.source_type AS "sourceType"
         FROM sources s JOIN source_chunks ch ON ch.source_id = s.id WHERE ch.character_id = $1 AND s.origin <> 'user'`,
          [id],
        ),
        this.db.query<CharacterCompatibility>(
          `SELECT other_character_id AS "otherCharacterId", relation, note FROM character_relations WHERE character_id = $1`,
          [id],
        ),
        this.db.query<CharacterConstraint>(
          `SELECT kind, rule FROM character_constraints WHERE character_id = $1`,
          [id],
        ),
        this.db.query<{ slug: string }>(
          `SELECT p.slug FROM character_perspectives cp JOIN perspectives p ON p.id = cp.perspective_id WHERE cp.character_id = $1 ORDER BY cp.strength DESC`,
          [id],
        ),
        this.db.query<{ concept: string }>(
          `SELECT concept FROM character_concepts WHERE character_id = $1 ORDER BY concept`,
          [id],
        ),
      ]);
    return {
      ...base,
      knownPositions: positions.rows,
      works: works.rows,
      sources: sources.rows,
      compatibility: relations.rows,
      constraints: constraints.rows,
      perspectiveSlugs: perspectives.rows.map((r) => r.slug),
      concepts: concepts.rows.map((r) => r.concept),
    };
  }
}
