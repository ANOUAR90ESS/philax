import type { DebateMove, RoundPhase } from '@philax/types';
import type { DebatePlan } from './plan';

export interface TurnSpec {
  /** Stable idempotency key within the debate: "<round>:<index>". */
  key: string;
  speakerId: string;
  move: DebateMove;
  /** Turn whose message this one replies to (resolved at generation time). */
  replyTo:
    | { kind: 'opening_of'; characterId: string }
    | { kind: 'turn'; key: string }
    | { kind: 'phase_turn'; phase: RoundPhase; index: number }
    | { kind: 'user_message'; messageId: string }
    | null;
  addressedIds: string[];
  /** Phase-specific guidance for the turn prompt. */
  instruction: string;
  axisId?: string;
  /** Whether this turn must cite evidence. */
  requiresCitation: boolean;
}

export interface ScheduleParticipant {
  characterId: string;
  seat: number;
  role: string;
}

/**
 * Deterministic turn plan for a round. The LLM decides *what* is argued; the
 * engine decides *who speaks to whom*, so every round is a real exchange rather
 * than independent answers (§10, §19).
 */
export function turnsForRound(
  roundNumber: number,
  phase: RoundPhase,
  plan: DebatePlan,
  participants: ScheduleParticipant[],
  ctx: { userMessageId?: string; userMessageCount?: number } = {},
): TurnSpec[] {
  const seats = [...participants].sort((a, b) => a.seat - b.seat);
  const k = (i: number) => `${roundNumber}:${i}`;
  switch (phase) {
    case 'OPENING':
      return seats.map((p, i) => {
        const opening = plan.openings.find((o) => o.characterId === p.characterId);
        return {
          key: k(i),
          speakerId: p.characterId,
          move: 'assert',
          replyTo: null,
          addressedIds: [],
          instruction: `Opening position. State your position on the topic from your perspective. Planned angle: ${opening?.angle ?? 'your central position'}.`,
          requiresCitation: true,
        };
      });
    case 'CHALLENGE':
      return plan.challenges.map((c, i) => ({
        key: k(i),
        speakerId: c.challengerId,
        move: 'challenge',
        replyTo: { kind: 'opening_of', characterId: c.targetId },
        addressedIds: [c.targetId],
        axisId: c.axisId,
        instruction:
          'Direct challenge. Press the strongest objection (given below) against the target’s opening position. Attack a premise, assumption or reading of evidence — not a caricature.',
        requiresCitation: true,
      }));
    case 'RESPONSE': {
      const targets = [...new Set(plan.challenges.map((c) => c.targetId))];
      return targets.map((t, i) => {
        const idx = plan.challenges.findIndex((c) => c.targetId === t);
        return {
          key: k(i),
          speakerId: t,
          move: 'respond',
          replyTo: { kind: 'phase_turn', phase: 'CHALLENGE', index: idx },
          addressedIds: [plan.challenges[idx]?.challengerId as string],
          instruction:
            'Response. Answer the challenge made against you. Concede what must be conceded, then defend or refine your position. Do not simply repeat your opening.',
          requiresCitation: true,
        };
      });
    }
    case 'CROSS_EXAMINATION':
      return plan.crossExaminations.slice(0, 2).flatMap((x, i) => [
        {
          key: k(i * 2),
          speakerId: x.askerId,
          move: 'question' as const,
          replyTo: null,
          addressedIds: [x.responderId],
          instruction: `Cross-examination question. Ask ONE pointed question that exposes a tension in the other participant’s view. Focus: ${x.focus}`,
          requiresCitation: false,
        },
        {
          key: k(i * 2 + 1),
          speakerId: x.responderId,
          move: 'answer' as const,
          replyTo: { kind: 'turn' as const, key: k(i * 2) },
          addressedIds: [x.askerId],
          instruction:
            'Answer the question put to you directly and honestly, then explain why your answer does not undermine your position (or concede that it does).',
          requiresCitation: true,
        },
      ]);
    case 'DEEP_DISAGREEMENT': {
      const axis = plan.disagreementAxes.find((a) => a.id === plan.deepestDisagreement.axisId);
      const speakers = seats.filter((p) => axis?.between.includes(p.characterId));
      const list = speakers.length >= 2 ? speakers : seats;
      return list.map((p, i) => ({
        key: k(i),
        speakerId: p.characterId,
        move: 'reframe',
        replyTo: null,
        addressedIds: list.filter((x) => x.characterId !== p.characterId).map((x) => x.characterId),
        axisId: axis?.id,
        instruction: `Deep disagreement. Name the underlying assumption or value that truly separates you from the others on: "${plan.deepestDisagreement.question}". Explain why the disagreement is not merely verbal.`,
        requiresCitation: true,
      }));
    }
    case 'OPEN_QUESTION':
      return seats.map((p, i) => ({
        key: k(i),
        speakerId: p.characterId,
        move: 'assert',
        replyTo: null,
        addressedIds: [],
        instruction: `The open question: "${plan.openQuestion}". Give your brief final take and say what would have to be true for you to change your mind. Do not summarize the whole debate.`,
        requiresCitation: true,
      }));
    case 'USER_EXCHANGE': {
      // Rotate who answers first so different participants engage over time.
      const offset = (ctx.userMessageCount ?? 0) % seats.length;
      const rotated = [...seats.slice(offset), ...seats.slice(0, offset)];
      const moves: { move: DebateMove; instruction: string }[] = [
        {
          move: 'respond',
          instruction:
            'Respond to the user’s contribution from your perspective. Take it seriously, but do not agree just to please them; say clearly where you agree and where you do not.',
        },
        {
          move: 'challenge',
          instruction:
            'Challenge the user’s contribution with the strongest objection your perspective offers. Be respectful and precise.',
        },
        {
          move: 'reframe',
          instruction:
            'Reframe the user’s contribution: show how your perspective would pose the question differently.',
        },
      ];
      return rotated.slice(0, Math.min(3, rotated.length)).map((p, i) => ({
        key: k(i),
        speakerId: p.characterId,
        move: (moves[i] as { move: DebateMove }).move,
        replyTo: ctx.userMessageId ? { kind: 'user_message', messageId: ctx.userMessageId } : null,
        addressedIds: [],
        instruction: (moves[i] as { instruction: string }).instruction,
        requiresCitation: true,
      }));
    }
  }
}
