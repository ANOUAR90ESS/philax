import type { DebateView } from '@philax/types';
import { canUserJoin, nextAction, schedule } from '../domain/state-machine';
import type { DebateRecord } from '../repositories/debate-repository';
import type { Repos } from './context';
import { stripTurnKey } from './turn-generator';

export async function buildDebateView(
  repos: Repos,
  debate: DebateRecord,
  limits: { maxRounds: number; maxUserMessages: number },
): Promise<DebateView> {
  const [topic, participants, rounds, messages] = await Promise.all([
    repos.topics.get(debate.topicId),
    repos.participants.listForView(debate.id),
    repos.rounds.list(debate.id),
    repos.messages.list(debate.id),
  ]);
  const analysis = topic?.analysis ?? null;
  const incomplete = rounds.some((r) => r.status !== 'completed');
  const action = nextAction(debate.mode, debate.phase, limits.maxRounds);
  const userMessages = messages.filter((m) => m.speaker.type === 'user').length;
  return {
    id: debate.id,
    mode: debate.mode,
    phase: debate.phase,
    input: {
      type: topic?.inputType ?? 'text',
      preview: topic?.inputPreview ?? '',
      sourceUrl: topic?.inputUrl ?? null,
    },
    topic: analysis
      ? {
          title: analysis.title,
          summary: analysis.summary,
          concepts: analysis.concepts,
          questions: analysis.questions,
          claims: analysis.claims,
          tensions: analysis.tensions,
        }
      : null,
    participants,
    rounds: rounds.map(({ id: _id, ...r }) => r),
    plannedRounds: schedule(debate.mode, limits.maxRounds).length,
    messages: messages.map(stripTurnKey),
    disagreementAxes: debate.plan?.disagreementAxes.map((a) => a.description) ?? [],
    challenge: debate.challenge,
    synthesis: debate.synthesis,
    canUserJoin: !incomplete && canUserJoin(debate.phase) && userMessages < limits.maxUserMessages,
    nextAction: incomplete
      ? 'advance'
      : action.kind === 'synthesize'
        ? 'synthesize'
        : action.kind === 'none'
          ? 'none'
          : 'advance',
    saved: debate.saved,
    language: debate.language,
    createdAt: debate.createdAt,
  };
}
