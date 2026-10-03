import type { DebateMessage, DebateMove } from '@philax/types';

export const AVATAR_STATES = [
  'IDLE',
  'LISTENING',
  'THINKING',
  'SPEAKING',
  'CHALLENGING',
  'RESPONDING',
  'AGREEING',
  'DISAGREEING',
  'CONSIDERING',
] as const;
export type AvatarState = (typeof AVATAR_STATES)[number];

/** State of the character delivering a move. */
export function speakerState(move: DebateMove): AvatarState {
  switch (move) {
    case 'challenge':
    case 'question':
      return 'CHALLENGING';
    case 'respond':
    case 'answer':
      return 'RESPONDING';
    case 'concede':
      return 'AGREEING';
    default:
      return 'SPEAKING';
  }
}

/** State of a character hearing a move; only those addressed react visibly. */
export function listenerState(move: DebateMove, addressed: boolean): AvatarState {
  if (!addressed) return 'LISTENING';
  switch (move) {
    case 'challenge':
      return 'DISAGREEING';
    case 'question':
    case 'reframe':
      return 'CONSIDERING';
    case 'concede':
      return 'AGREEING';
    default:
      return 'LISTENING';
  }
}

export interface StageMoment {
  /** Message being presented, if any. */
  speaking?: Pick<DebateMessage, 'speaker' | 'move' | 'addressedCharacterIds'>;
  /** Character whose next turn is being generated. */
  thinkingCharacterId?: string;
}

/** Avatar state of every participant at one moment of the debate. */
export function stageStates(
  participantIds: readonly string[],
  moment: StageMoment,
): Record<string, AvatarState> {
  const states: Record<string, AvatarState> = {};
  const speaker =
    moment.speaking?.speaker.type === 'character' ? moment.speaking.speaker.characterId : null;
  for (const id of participantIds) {
    if (moment.speaking && speaker) {
      states[id] =
        id === speaker
          ? speakerState(moment.speaking.move)
          : listenerState(moment.speaking.move, moment.speaking.addressedCharacterIds.includes(id));
    } else if (moment.thinkingCharacterId) {
      states[id] = id === moment.thinkingCharacterId ? 'THINKING' : 'LISTENING';
    } else states[id] = 'IDLE';
  }
  return states;
}
