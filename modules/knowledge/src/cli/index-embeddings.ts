import { createEmbeddingProvider } from '@philax/ai';
import { loadDotEnv, loadEnv } from '@philax/config';
import { PoolDb } from '@philax/database';
import { indexMissingEmbeddings } from '../services/indexer';

loadDotEnv();
const env = loadEnv();
const embeddings = createEmbeddingProvider({
  openaiApiKey: env.OPENAI_API_KEY,
  googleApiKey: env.GOOGLE_AI_API_KEY,
  embeddingModel: env.EMBEDDING_MODEL,
  tiers: { fast: [], strong: [], premium: [] },
  timeoutMs: env.LLM_TIMEOUT_MS,
  maxRetries: env.LLM_MAX_RETRIES,
});
if (!embeddings) {
  console.info(
    '[index] EMBEDDING_MODEL is not set; retrieval will use full-text search only. Nothing to do.',
  );
  process.exit(0);
}
const db = new PoolDb(env.DATABASE_URL, { max: 2 });
try {
  const n = await indexMissingEmbeddings(db, embeddings, {
    onProgress: (d) => console.info(`[index] embedded ${d}`),
  });
  console.info(`[index] done: ${n} chunks embedded with ${embeddings.model}`);
} finally {
  await db.close();
}
