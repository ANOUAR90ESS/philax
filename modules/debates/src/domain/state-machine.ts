import { AppError, type DebateMode, type DebatePhase, type RoundPhase } from '@philax/types';

/** Round schedule per mode (§21; challenge mode per §27). */
export const ROUND_SCHEDULE: Record<DebateMode, RoundPhase[]> = {
  debate: [
    'OPENING',
    'CHALLENGE',
    'RESPONSE',
    'CROSS_EXAMINATION',
    'DEEP_DISAGREEMENT',
    'OPEN_QUESTION',
  ],
  challenge: ['OPENING', 'CHALLENGE', 'RESPONSE'],
};

export type NextAction =
  | { kind: 'prepare' }
  | { kind: 'round'; phase: RoundPhase }
  | { kind: 'synthesize' }
  | { kind: 'none' };

export function schedule(mode: DebateMode, maxRounds: number): RoundPhase[] {
  return ROUND_SCHEDULE[mode].slice(0, Math.max(1, maxRounds));
}

/**
 * Pure transition logic of the debate state machine (§19):
 * DEBATE_CREATED → TOPIC_ANALYZED → CHARACTERS_SELECTED → DEBATE_PLANNED →
 * OPENING → … → OPEN_QUESTION → USER_CHALLENGE → SYNTHESIS → COMPLETED.
 */
export function nextAction(mode: DebateMode, phase: DebatePhase, maxRounds: number): NextAction {
  const rounds = schedule(mode, maxRounds);
  switch (phase) {
    case 'DEBATE_CREATED':
    case 'TOPIC_ANALYZED':
    case 'CHARACTERS_SELECTED':
      return { kind: 'prepare' };
    case 'DEBATE_PLANNED':
      return { kind: 'round', phase: rounds[0] as RoundPhase };
    case 'USER_CHALLENGE':
      return { kind: 'synthesize' };
    case 'SYNTHESIS':
      return { kind: 'synthesize' };
    case 'COMPLETED':
    case 'FAILED':
      return { kind: 'none' };
    default: {
      const idx = rounds.indexOf(phase as RoundPhase);
      if (idx < 0) return { kind: 'synthesize' };
      const next = rounds[idx + 1];
      return next ? { kind: 'round', phase: next } : { kind: 'synthesize' };
    }
  }
}

/** Phase after a round of `phase` completes. */
export function phaseAfterRound(
  mode: DebateMode,
  phase: RoundPhase,
  maxRounds: number,
): DebatePhase {
  if (phase === 'USER_EXCHANGE')
    throw new AppError('INTERNAL', 'User exchanges do not change the phase.');
  const rounds = schedule(mode, maxRounds);
  return rounds.indexOf(phase) === rounds.length - 1 ? 'USER_CHALLENGE' : phase;
}

/** The user may enter the debate once opening positions exist (§26). */
export function canUserJoin(phase: DebatePhase): boolean {
  return [
    'CHALLENGE',
    'RESPONSE',
    'CROSS_EXAMINATION',
    'DEEP_DISAGREEMENT',
    'OPEN_QUESTION',
    'USER_CHALLENGE',
    'OPENING',
  ].includes(phase);
}

export function assertCanJoin(phase: DebatePhase): void {
  if (!canUserJoin(phase))
    throw new AppError(
      'INVALID_STATE',
      'You can join once the opening positions have been presented.',
    );
}
