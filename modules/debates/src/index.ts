export { DebateService } from './services/debate-service';
export type {
  DebateServiceDeps,
  ParticipantPreparer,
  PreparableParticipant,
} from './services/debate-service';
export { PgAdvisoryLock } from './services/lock';
export type { DebateLock } from './services/lock';
export { AiCallRepository } from './repositories/ai-call-repository';
export {
  ROUND_SCHEDULE,
  nextAction,
  phaseAfterRound,
  canUserJoin,
  schedule,
} from './domain/state-machine';
export { turnsForRound } from './domain/turns';
export type { TurnSpec } from './domain/turns';
export { DebatePlanSchema, validatePlan } from './domain/plan';
export type { DebatePlan } from './domain/plan';
export { extractCitationLabels, findWinnerLanguage, findCertaintyClaim } from './domain/guards';
export { fallbackPlan } from './services/preparation-service';
export { validateSynthesis } from './services/synthesis-service';
export {
  TurnOutputSchema,
  SynthesisOutputSchema,
  ConsistencyVerdictSchema,
  ChallengeFramingOutputSchema,
  ObjectionCandidatesSchema,
} from './schemas/llm-outputs';
export type { TurnOutput } from './schemas/llm-outputs';
