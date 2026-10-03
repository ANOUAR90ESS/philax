import { uuidv7, type Db } from '@philax/database';
import type { LLMCallRecord } from '@philax/ai';

/** Persists LLM call telemetry (§52). No prompt or completion content is stored. */
export class AiCallRepository {
  constructor(private readonly db: Db) {}

  async insert(r: LLMCallRecord): Promise<void> {
    await this.db.query(
      `INSERT INTO ai_calls (id, debate_id, topic_id, operation, tier, provider, model, prompt_version, attempt, latency_ms,
         input_tokens, output_tokens, estimated_cost_usd, retrieval_count, validation_status, error_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        uuidv7(),
        r.trace.debateId ?? null,
        r.trace.topicId ?? null,
        r.operation,
        r.tier,
        r.provider,
        r.model,
        r.promptVersion,
        r.attempt,
        r.latencyMs,
        r.inputTokens,
        r.outputTokens,
        r.estimatedCostUsd,
        r.trace.retrievalCount ?? null,
        r.validationStatus,
        r.errorCode,
      ],
    );
  }
}
