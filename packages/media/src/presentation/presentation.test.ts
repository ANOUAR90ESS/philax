import type { DebateMessage, DebateParticipant } from '@philax/types';
import { describe, expect, it } from 'vitest';
import { MediaProfileRegistry } from '../registry';
import { planPresentation, stageStates } from './presentation';

const ids = {
  n: '00000000-0000-4000-8000-000000000001',
  m: '00000000-0000-4000-8000-000000000002',
  a: '00000000-0000-4000-8000-000000000003',
};

function participant(id: string, slug: string, seat: number): DebateParticipant {
  return {
    character: {
      id,
      slug,
      displayName: slug,
      type: 'philosopher',
      birthYear: 1800,
      deathYear: 1900,
      era: 'x',
      representation: 'historical',
      worldviewSummary: 'x',
    },
    role: 'debater',
    perspective: { slug: 'p', label: 'P' },
    selectionReason: 'x',
    seat,
  };
}

const participants = [
  participant(ids.n, 'friedrich-nietzsche', 0),
  participant(ids.m, 'karl-marx', 1),
  participant(ids.a, 'hannah-arendt', 2),
];

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

describe('planPresentation', () => {
  const registry = new MediaProfileRegistry();

  it('turns a debate message into a staged, subtitled turn for the right character', () => {
    const plan = planPresentation(message({}), participants, registry, 'en');
    expect(plan?.characterSlug).toBe('friedrich-nietzsche');
    expect(plan?.media.status).toBe('ready');
    expect(plan?.segments.map((s) => s.text)).toEqual(['God is dead.', 'And we have killed him.']);
    expect(plan?.states[ids.n]).toBe('SPEAKING');
  });

  it('keeps the same character media whatever the language', () => {
    const en = planPresentation(message({}), participants, registry, 'en');
    const ar = planPresentation(message({ content: 'الإله مات.' }), participants, registry, 'ar');
    expect(ar?.media).toEqual(en?.media);
  });

  it('does not stage user messages or unknown speakers', () => {
    expect(
      planPresentation(message({ speaker: { type: 'user' } }), participants, registry, 'en'),
    ).toBeNull();
    expect(
      planPresentation(
        message({
          speaker: { type: 'character', characterId: '00000000-0000-4000-8000-0000000000ff' },
        }),
        participants,
        registry,
        'en',
      ),
    ).toBeNull();
  });

  it('marks characters without a validated profile as unavailable rather than borrowing one', () => {
    const extra = [
      ...participants,
      participant('00000000-0000-4000-8000-000000000009', 'new-thinker', 3),
    ];
    const plan = planPresentation(
      message({
        speaker: { type: 'character', characterId: '00000000-0000-4000-8000-000000000009' },
      }),
      extra,
      registry,
      'en',
    );
    expect(plan?.media).toMatchObject({ status: 'unavailable', reason: 'no_profile' });
  });
});
