import { loadSeed, readSeedData, SEEDS_DIR, characterId } from '@philax/database';
import { indexMissingEmbeddings, RetrievalService } from '@philax/knowledge';
import { afterAll, describe, expect, it } from 'vitest';
import { createTestDb } from '../support/db';
import { HashingEmbeddingProvider } from '../support/hashing-embeddings';

const db = createTestDb();
afterAll(() => db.close());

describe('seeded knowledge base', () => {
  it('contains 20–30 characters, each with sourced positions and chunks', async () => {
    const { rows } = await db.query<{
      slug: string;
      positions: number;
      sourced: number;
      chunks: number;
    }>(
      `SELECT c.slug,
        (SELECT count(*)::int FROM character_positions p WHERE p.character_id = c.id) AS positions,
        (SELECT count(*)::int FROM character_positions p WHERE p.character_id = c.id AND p.source_id IS NOT NULL) AS sourced,
        (SELECT count(*)::int FROM source_chunks s WHERE s.character_id = c.id AND s.retired_at IS NULL) AS chunks
       FROM characters c`,
    );
    expect(rows.length).toBeGreaterThanOrEqual(20);
    expect(rows.length).toBeLessThanOrEqual(30);
    for (const r of rows) {
      expect(r.positions, r.slug).toBeGreaterThanOrEqual(2);
      expect(r.sourced, r.slug).toBe(r.positions);
      expect(r.chunks, r.slug).toBeGreaterThan(r.positions);
    }
  });

  it('never invents URLs for seed sources', async () => {
    const { rows } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM sources WHERE origin = 'seed' AND url IS NOT NULL`,
    );
    expect(rows[0]?.n).toBe(0);
  });

  it('marks living figures as contemporary', async () => {
    const { rows } = await db.query<{ slug: string }>(
      `SELECT slug FROM characters WHERE death_year IS NULL ORDER BY slug`,
    );
    const { rows: contemporary } = await db.query<{ slug: string }>(
      `SELECT slug FROM characters WHERE representation = 'contemporary' ORDER BY slug`,
    );
    expect(contemporary).toEqual(rows);
  });

  it('re-seeding is idempotent and retires (not deletes) changed chunks', async () => {
    const data = await readSeedData(SEEDS_DIR);
    const before = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM source_chunks WHERE retired_at IS NULL`,
    );
    const again = await loadSeed(db, data);
    expect(again.retiredChunks).toBe(0);

    const mill = data.characters.find((c) => c.slug === 'john-stuart-mill');
    if (!mill) throw new Error('fixture');
    const changed = structuredClone(data);
    const m = changed.characters.find((c) => c.slug === 'john-stuart-mill');
    if (!m?.positions[0]) throw new Error('fixture');
    m.positions[0].statement += ' (revised wording)';
    const res = await loadSeed(db, changed);
    expect(res.retiredChunks).toBe(1);
    const retired = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM source_chunks WHERE retired_at IS NOT NULL AND character_id = $1`,
      [characterId('john-stuart-mill')],
    );
    expect(retired.rows[0]?.n).toBe(1);

    await loadSeed(db, data); // restore: the original chunk is reactivated
    const after = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM source_chunks WHERE retired_at IS NULL`,
    );
    expect(after.rows[0]?.n).toBe(before.rows[0]?.n);
  });
});

describe('RetrievalService', () => {
  it('finds relevant documented knowledge lexically without embeddings', async () => {
    const svc = new RetrievalService(db, null);
    const res = await svc.retrieve({
      text: 'Is it ever right to silence an opinion? freedom of expression',
      limit: 5,
    });
    expect(res.trace.vectorEnabled).toBe(false);
    expect(res.chunks.length).toBeGreaterThan(0);
    expect(res.chunks.some((c) => c.characterId === characterId('john-stuart-mill'))).toBe(true);
    expect(res.chunks.every((c) => c.method === 'lexical')).toBe(true);
  });

  it('filters by character and tops up with documented positions', async () => {
    const svc = new RetrievalService(db, null);
    const heidegger = characterId('martin-heidegger');
    const res = await svc.retrieveForCharacter(
      heidegger,
      { text: 'zebra quantum spaghetti', limit: 4 },
      3,
    );
    expect(res.chunks).toHaveLength(3);
    expect(res.chunks.every((c) => c.characterId === heidegger)).toBe(true);
    expect(res.chunks.every((c) => c.method === 'direct')).toBe(true);
  });

  it('uses pgvector and fuses rankings when embeddings are configured', async () => {
    const embeddings = new HashingEmbeddingProvider();
    const indexed = await indexMissingEmbeddings(db, embeddings);
    expect(indexed).toBeGreaterThan(200);
    expect(await indexMissingEmbeddings(db, embeddings)).toBe(0);
    const svc = new RetrievalService(db, embeddings);
    const res = await svc.retrieve({ text: 'technology enframing standing reserve', limit: 5 });
    expect(res.trace).toMatchObject({ vectorEnabled: true, embeddingModel: 'test:hashing-bow' });
    expect(res.trace.vectorHits).toBeGreaterThan(0);
    expect(res.chunks[0]?.characterId).toBe(characterId('martin-heidegger'));
    expect(res.chunks.some((c) => c.method === 'hybrid')).toBe(true);
  });

  it('never returns other users’ private sources', async () => {
    const owner = '00000000-0000-7000-8000-000000000001';
    await db.query(
      `INSERT INTO users (id, email, password_hash) VALUES ($1, 'owner@test.dev', 'x') ON CONFLICT DO NOTHING`,
      [owner],
    );
    await db.query(
      `INSERT INTO sources (id, title, source_type, origin, owner_user_id) VALUES ('00000000-0000-7000-8000-0000000000aa', 'Private', 'user-provided', 'user', $1)`,
      [owner],
    );
    await db.query(
      `INSERT INTO source_chunks (id, source_id, ordinal, content, knowledge_kind) VALUES ('00000000-0000-7000-8000-0000000000ab', '00000000-0000-7000-8000-0000000000aa', 0, 'zanzibarian secret manifesto', 'user_content')`,
    );
    const svc = new RetrievalService(db, null);
    expect((await svc.retrieve({ text: 'zanzibarian', userId: null })).chunks).toHaveLength(0);
    const own = (await svc.retrieve({ text: 'zanzibarian', userId: owner })).chunks;
    expect(own.map((c) => c.content)).toEqual(['zanzibarian secret manifesto']);
    await db.query(`DELETE FROM users WHERE id = $1`, [owner]);
  });
});
