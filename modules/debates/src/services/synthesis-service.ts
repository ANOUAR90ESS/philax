import { generateStructured, type LLMGateway } from '@philax/ai';
import { synthesisPrompt } from '@philax/prompts';
import type { Citation, DebateStreamEvent, Synthesis } from '@philax/types';
import { findWinnerLanguage } from '../domain/guards';
import { SynthesisOutputSchema, type SynthesisOutput } from '../schemas/llm-outputs';
import { speakerName, type DebateContext, type Repos } from './context';

type Emit = (e: DebateStreamEvent) => void;

/** Final synthesis (§28, §68): maps agreements and disagreements; never a verdict. */
export class SynthesisService {
  constructor(
    private readonly gateway: LLMGateway,
    private readonly repos: Repos,
  ) {}

  async synthesize(ctx: DebateContext, emit: Emit): Promise<Synthesis> {
    await this.repos.debates.setPhase(ctx.debate.id, 'SYNTHESIS');
    ctx.debate.phase = 'SYNTHESIS';
    const participantIds = new Set(ctx.participants.map((p) => p.characterId));
    const messageIds = new Set(ctx.messages.map((m) => m.id));
    const prompt = synthesisPrompt.build({
      language: ctx.debate.language,
      topicTitle: ctx.analysis.title,
      participants: ctx.participants.map((p) => ({
        characterId: p.characterId,
        name: ctx.speakers.get(p.characterId)?.character.displayName ?? '',
        perspective: p.perspectiveLabel,
      })),
      messages: ctx.messages.map((m) => ({
        messageId: m.id,
        speaker: speakerName(ctx, m),
        speakerId: m.speaker.type === 'character' ? m.speaker.characterId : null,
        move: m.move,
        text: m.content,
        claim: m.argument?.claim ?? null,
        assumptions: m.argument?.assumptions ?? [],
      })),
      userPositions: ctx.debate.memory.userPositions.map((u) => u.content),
      axes: ctx.plan.disagreementAxes.map((a) => ({
        id: a.id,
        axis: a.axis,
        description: a.description,
      })),
    });
    const { data } = await generateStructured(
      this.gateway,
      {
        tier: 'premium',
        operation: 'debate.synthesis',
        promptVersion: prompt.version,
        system: prompt.system,
        messages: prompt.messages,
        maxOutputTokens: 5000,
        trace: { debateId: ctx.debate.id },
      },
      SynthesisOutputSchema,
      { refine: (d) => validateSynthesis(d as SynthesisOutput, participantIds, messageIds) },
    );

    // Sources and the user's position are filled deterministically, never by the model.
    const sources = new Map<string, Citation>();
    for (const m of ctx.messages) for (const c of m.citations) sources.set(c.evidenceId, c);
    const synthesis: Synthesis = {
      ...data,
      sources: [...sources.values()].sort(
        (a, b) => Number(a.evidenceId.slice(1)) - Number(b.evidenceId.slice(1)),
      ),
      userPosition: ctx.debate.memory.userPositions.at(-1)?.content ?? null,
    };
    await this.repos.debates.setSynthesis(ctx.debate.id, synthesis);
    await this.repos.debates.setPhase(ctx.debate.id, 'COMPLETED');
    ctx.debate.phase = 'COMPLETED';
    ctx.debate.synthesis = synthesis;
    emit({ type: 'synthesis', synthesis });
    return synthesis;
  }
}

export function validateSynthesis(
  s: SynthesisOutput,
  participantIds: ReadonlySet<string>,
  messageIds: ReadonlySet<string>,
): string | null {
  const ids = [
    ...s.agreements.flatMap((a) => a.participantIds),
    ...s.disagreements.flatMap((d) => d.positions.map((p) => p.characterId)),
    ...s.assumptions.map((a) => a.characterId),
    ...s.keyArguments.map((k) => k.characterId),
  ];
  const badId = ids.find((id) => !participantIds.has(id));
  if (badId) return `unknown participant id ${badId}`;
  const badMsg = s.keyArguments.find((k) => !messageIds.has(k.messageId));
  if (badMsg) return `unknown messageId ${badMsg.messageId}`;
  const verdict = findWinnerLanguage(JSON.stringify(s));
  if (verdict) return `the synthesis must not declare a winner or verdict (found "${verdict}")`;
  return null;
}
