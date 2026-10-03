export { PerspectiveRepository } from './repositories/perspective-repository';
export type { CatalogPerspective } from './repositories/perspective-repository';
export {
  selectPerspectives,
  scoreRelevance,
  perspectiveDistance,
  averageDistance,
} from './domain/perspective-engine';
export type {
  PerspectivePlan,
  SelectedPerspective,
  PerspectiveEngineOptions,
} from './domain/perspective-engine';
