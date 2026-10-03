import type { DebateMessage } from '@philax/types';
import { describe, expect, it } from 'vitest';
import { stageStates } from './presentation';

const ids = {
  n: '00000000-0000-4000-8000-000000000001',
  m: '00000000-0000-4000-8000-000000000002',
  a: '00000000-0000-4000-8000-000000000003',
};

function message(over: Partial<DebateMessage>): DebateMessage {
  return {
    id: '00000000-0000-4000-8000-0000000000aa',
    debateId: '00000000-0000-4000-8000-0000000000bb',
    roundNumber: 1,
    phase: 'OPENING',
    speaker: { type: 'character', characterId: ids.n },
    move: 'assert',
    content: 'God is dead [E1]. And we have killed him.',
    argument: null,
    citations: [],
    replyToMessageId: null,
    addressedCharacterIds: [],
    createdAt: new Date(0).toISOString(),
    ...over,
  };
}

describe('stage states', () => {
  it('puts the speaker in a speaking state and everyone else in listening', () => {
    expect(stageStates(Object.values(ids), { speaking: message({}) })).toEqual({
      [ids.n]: 'SPEAKING',
      [ids.m]: 'LISTENING',
      [ids.a]: 'LISTENING',
    });
    const reply = message({
      speaker: { type: 'character', characterId: ids.m },
      move: 'challenge',
      addressedCharacterIds: [ids.n],
    });
    expect(stageStates(Object.values(ids), { speaking: reply })).toEqual({
      [ids.n]: 'DISAGREEING',
      [ids.m]: 'CHALLENGING',
      [ids.a]: 'LISTENING',
    });
  });

  it('shows the next speaker thinking while the turn is generated, idle otherwise', () => {
    expect(stageStates([ids.n, ids.m], { thinkingCharacterId: ids.m })).toEqual({
      [ids.n]: 'LISTENING',
      [ids.m]: 'THINKING',
    });
    expect(stageStates([ids.n], {})).toEqual({ [ids.n]: 'IDLE' });
  });
});
