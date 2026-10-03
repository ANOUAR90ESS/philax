import { describe, expect, it } from 'vitest';
import { extractCitationLabels, findCertaintyClaim, findWinnerLanguage } from './guards';
import { validatePlan, type DebatePlan } from './plan';
import { canUserJoin, nextAction, phaseAfterRound, schedule } from './state-machine';
import { turnsForRound } from './turns';

const A = 'a0000000-0000-4000-8000-000000000001';
const B = 'b0000000-0000-4000-8000-000000000002';
const C = 'c0000000-0000-4000-8000-000000000003';
const participants = [
  { characterId: A, seat: 0, role: 'debater' },
  { characterId: B, seat: 1, role: 'debater' },
  { characterId: C, seat: 2, role: 'debater' },
];
const plan: DebatePlan = {
  disagreementAxes: [
    { id: 'x1', axis: 'values', description: 'Efficiency versus flourishing', between: [A, B] },
    {
      id: 'x2',
      axis: 'assumptions',
      description: 'Tools are neutral versus formative',
      between: [B, C],
    },
  ],
  openings: [
    { characterId: A, angle: 'tools as extension', claimIds: ['c1'] },
    { characterId: B, angle: 'enframing', claimIds: [] },
    { characterId: C, angle: 'habituation', claimIds: ['c2'] },
  ],
  challenges: [
    { challengerId: B, targetId: A, axisId: 'x1' },
    { challengerId: C, targetId: B, axisId: 'x2' },
    { challengerId: A, targetId: C, axisId: 'x1' },
  ],
  crossExaminations: [
    { askerId: A, responderId: B, focus: 'Is any tool neutral?' },
    { askerId: C, responderId: A, focus: 'Does practice matter?' },
  ],
  deepestDisagreement: { axisId: 'x2', question: 'Are tools neutral?' },
  openQuestion: 'What should education protect?',
};

describe('state machine', () => {
  it('walks the full debate schedule then invites the user, then synthesis', () => {
    expect(nextAction('debate', 'DEBATE_CREATED', 6)).toEqual({ kind: 'prepare' });
    expect(nextAction('debate', 'DEBATE_PLANNED', 6)).toEqual({ kind: 'round', phase: 'OPENING' });
    expect(nextAction('debate', 'OPENING', 6)).toEqual({ kind: 'round', phase: 'CHALLENGE' });
    expect(nextAction('debate', 'DEEP_DISAGREEMENT', 6)).toEqual({
      kind: 'round',
      phase: 'OPEN_QUESTION',
    });
    expect(phaseAfterRound('debate', 'OPEN_QUESTION', 6)).toBe('USER_CHALLENGE');
    expect(phaseAfterRound('debate', 'CHALLENGE', 6)).toBe('CHALLENGE');
    expect(nextAction('debate', 'USER_CHALLENGE', 6)).toEqual({ kind: 'synthesize' });
    expect(nextAction('debate', 'COMPLETED', 6)).toEqual({ kind: 'none' });
  });

  it('supports shorter schedules (free tier, challenge mode)', () => {
    expect(schedule('debate', 3)).toEqual(['OPENING', 'CHALLENGE', 'RESPONSE']);
    expect(phaseAfterRound('debate', 'RESPONSE', 3)).toBe('USER_CHALLENGE');
    expect(schedule('challenge', 6)).toEqual(['OPENING', 'CHALLENGE', 'RESPONSE']);
  });

  it('lets the user join only after openings', () => {
    expect(canUserJoin('DEBATE_PLANNED')).toBe(false);
    expect(canUserJoin('OPENING')).toBe(true);
    expect(canUserJoin('USER_CHALLENGE')).toBe(true);
    expect(canUserJoin('COMPLETED')).toBe(false);
  });
});

describe('plan validation', () => {
  const ids = new Set([A, B, C]);
  it('accepts a coherent plan', () =>
    expect(validatePlan(plan, ids, new Set(['c1', 'c2']))).toBeNull());
  it('rejects unknown participants, self-challenges and one-sided challenges', () => {
    expect(
      validatePlan(
        { ...plan, challenges: [{ challengerId: A, targetId: A, axisId: 'x1' }] },
        ids,
        new Set(['c1', 'c2']),
      ),
    ).toMatch(/themselves/);
    expect(
      validatePlan(
        { ...plan, challenges: [{ challengerId: B, targetId: A, axisId: 'x1' }] },
        ids,
        new Set(['c1', 'c2']),
      ),
    ).toMatch(/two different/);
    expect(
      validatePlan({ ...plan, openings: plan.openings.slice(0, 2) }, ids, new Set(['c1', 'c2'])),
    ).toMatch(/missing opening/);
    expect(validatePlan(plan, ids, new Set(['c1']))).toMatch(/unknown claim/);
  });
});

describe('turn schedule', () => {
  it('builds a real exchange: challenges target openings, responses answer challenges', () => {
    const opening = turnsForRound(1, 'OPENING', plan, participants);
    expect(opening.map((t) => t.speakerId)).toEqual([A, B, C]);
    const challenge = turnsForRound(2, 'CHALLENGE', plan, participants);
    expect(challenge[0]).toMatchObject({
      speakerId: B,
      move: 'challenge',
      replyTo: { kind: 'opening_of', characterId: A },
    });
    const response = turnsForRound(3, 'RESPONSE', plan, participants);
    expect(response.map((t) => t.speakerId)).toEqual([A, B, C]);
    expect(response[0]?.replyTo).toEqual({ kind: 'phase_turn', phase: 'CHALLENGE', index: 0 });
    const cross = turnsForRound(4, 'CROSS_EXAMINATION', plan, participants);
    expect(cross.map((t) => t.move)).toEqual(['question', 'answer', 'question', 'answer']);
    expect(cross[1]?.replyTo).toEqual({ kind: 'turn', key: '4:0' });
    expect(cross[0]?.requiresCitation).toBe(false);
    const deep = turnsForRound(5, 'DEEP_DISAGREEMENT', plan, participants);
    expect(deep.map((t) => t.speakerId)).toEqual([B, C]);
    expect(
      new Set(turnsForRound(6, 'OPEN_QUESTION', plan, participants).map((t) => t.key)).size,
    ).toBe(3);
  });

  it('makes participants respond, challenge and reframe the user, rotating who starts', () => {
    const first = turnsForRound(7, 'USER_EXCHANGE', plan, participants, {
      userMessageId: 'u1',
      userMessageCount: 0,
    });
    expect(first.map((t) => t.move)).toEqual(['respond', 'challenge', 'reframe']);
    expect(first[0]?.replyTo).toEqual({ kind: 'user_message', messageId: 'u1' });
    const second = turnsForRound(8, 'USER_EXCHANGE', plan, participants, {
      userMessageId: 'u2',
      userMessageCount: 1,
    });
    expect(second[0]?.speakerId).toBe(B);
  });
});

describe('guards', () => {
  it('extracts citation labels', () => {
    expect(extractCitationLabels('As shown [E1] and [E2, E5], see [E1].')).toEqual([
      'E1',
      'E2',
      'E5',
    ]);
  });
  it('detects verdict language in en/es/ar', () => {
    expect(findWinnerLanguage('Mill is the winner of this exchange')).toBe('the winner');
    expect(findWinnerLanguage('Rawls won the debate')).toBeTruthy();
    expect(findWinnerLanguage('El ganador es Kant')).toBeTruthy();
    expect(findWinnerLanguage('الفائز هو كانط')).toBeTruthy();
    expect(findWinnerLanguage('They disagree about whether effort builds skill.')).toBeNull();
  });
  it('detects certainty claims about persons', () => {
    expect(findCertaintyClaim('Singer would definitely say yes')).toBeTruthy();
    expect(findCertaintyClaim('His published argument implies…')).toBeNull();
  });
});
