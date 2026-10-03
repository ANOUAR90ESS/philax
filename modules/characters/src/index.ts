export { CharacterRepository } from './repositories/character-repository';
export type { CharacterCandidate } from './repositories/character-repository';
export { impliedConstraints, formatYear } from './domain/representation';
export {
  scoreCandidate,
  assignByPerspective,
  pairAdjustment,
  SCORE_WEIGHTS,
} from './domain/scoring';
export type { PerspectiveTarget, ScoreBreakdown, ScoredCandidate } from './domain/scoring';
export { CharacterSelector } from './services/character-selector';
export type {
  SelectedParticipant,
  SelectionResult,
  SelectionTarget,
} from './services/character-selector';
