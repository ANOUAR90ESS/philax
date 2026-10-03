import { ArgumentMemory, parseArgument, selectStrongestObjection } from '@philax/arguments';
import { generateStructured, LLMError, type LLMGateway } from '@philax/ai';
import { uuidv7 } from '@philax/database';
import {
  challengePrompt,
  consistencyCheckerPrompt,
  crossExaminationPrompt,
  deepDisagreementPrompt,
  objectionGeneratorPrompt,
  openQuestionPrompt,
  openingPrompt,
  responsePrompt,
  userReplyPrompt,
  type PromptTemplate,
  type TurnPromptInput,
} from '@philax/prompts';
import { AppError, type DebateStreamEvent, type RoundPhase } from '@philax/types';
import { extractCitationLabels, findCertaintyClaim, findWinnerLanguage } from '../domain/guards';
import { pushUnique, type DebateMemory } from '../domain/memory';
import type { TurnSpec } from '../domain/turns';
import { citationTag, type EvidenceItem } from '../repositories/evidence-repository';
import type { StoredMessage } from '../repositories/message-repository';
import type { RoundRow } from '../repositories/round-repository';
import {
  ConsistencyVerdictSchema,
  ObjectionCandidatesSchema,
  TurnOutputSchema,
  type ConsistencyVerdict,
  type TurnOutput,
} from '../schemas/llm-outputs';
import { speakerName, type DebateContext, type Repos, type SpeakerProfile } from './context';

const TEMPLATES: Record<RoundPhase, PromptTemplate<TurnPromptInput>> = {
  OPENING: openingPrompt,
  CHALLENGE: challengePrompt,
  RESPONSE: responsePrompt,
  CROSS_EXAMINATION: crossExaminationPrompt,
  DEEP_DISAGREEMENT: deepDisagreementPrompt,
  OPEN_QUESTION: openQuestionPrompt,
  USER_EXCHANGE: userReplyPrompt,
};

const PHASE_LABEL: Record<RoundPhase, string> = {
  OPENING: 'Opening positions',
  CHALLENGE: 'Direct challenges',
  RESPONSE: 'Responses',
  CROSS_EXAMINATION: 'Cross-examination',
  DEEP_DISAGREEMENT: 'Deep disagreement',
  OPEN_QUESTION: 'The open question',
  USER_EXCHANGE: 'Responding to the user',
};

export interface TurnGeneratorOptions {
  maxAttempts?: number;
  /** Max evidence items shown to a speaker per turn. */
  evidencePerTurn?: number;
}

type Emit = (e: DebateStreamEvent) => void;

interface Rejection {
  reason: string;
  feedback: string;
}

/**
 * Generates one debate turn (§24, §37, §64–65): stream → schema validation →
 * citation validation → verdict/certainty guards → redundancy check → LLM
 * consistency check → accept, or regenerate with feedback. Nothing is persisted
 * until a turn is accepted.
 */
export class TurnGenerator {
  private readonly maxAttempts: number;
  private readonly evidencePerTurn: number;

  constructor(
    private readonly gateway: LLMGateway,
    private readonly repos: Repos,
    opts: TurnGeneratorOptions = {},
  ) {
    this.maxAttempts = opts.maxAttempts ?? 3;
    this.evidencePerTurn = opts.evidencePerTurn ?? 10;
  }

  async generate(
    ctx: DebateContext,
    round: RoundRow,
    spec: TurnSpec,
    emit: Emit,
  ): Promise<StoredMessage> {
    const speaker = ctx.speakers.get(spec.speakerId);
    if (!speaker) throw new AppError('INTERNAL', 'Unknown speaker in turn plan.');
    const turnId = `${ctx.debate.id}:${spec.key}`;
    emit({ type: 'turn_started', turnId, characterId: spec.speakerId });

    const evidence = this.evidenceFor(ctx, spec.speakerId);
    const allowed = new Map(evidence.map((e) => [e.label, e]));
    const replyTo = this.resolveReplyTo(ctx, spec);
    const plannedObjection =
      spec.move === 'challenge' && replyTo
        ? await this.strongestObjection(ctx, speaker, replyTo)
        : null;
    const memory = new ArgumentMemory(ctx.debate.memory.arguments);
    const template = TEMPLATES[round.phase];

    let feedback: string | null = null;
    const rejections: Rejection[] = [];
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      const prompt = template.build(
        this.promptInput(ctx, round, spec, speaker, evidence, replyTo, plannedObjection, feedback),
      );
      let emitted = '';
      let output: TurnOutput;
      try {
        ({ data: output } = await generateStructured(
          this.gateway,
          {
            tier: round.phase === 'DEEP_DISAGREEMENT' ? 'premium' : 'strong',
            operation: `debate.turn.${round.phase.toLowerCase()}`,
            promptVersion: prompt.version,
            system: prompt.system,
            messages: prompt.messages,
            maxOutputTokens: 3000,
            trace: { debateId: ctx.debate.id, retrievalCount: evidence.length },
          },
          TurnOutputSchema,
          {
            streamField: {
              name: 'speech',
              onField: (value) => {
                if (value.startsWith(emitted)) {
                  const delta = value.slice(emitted.length);
                  if (delta) emit({ type: 'draft', turnId, delta });
                } else {
                  emit({ type: 'draft', turnId, delta: value, reset: true });
                }
                emitted = value;
              },
            },
          },
        ));
      } catch (err) {
        if (
          err instanceof AppError &&
          err.code === 'AI_OUTPUT_INVALID' &&
          attempt < this.maxAttempts
        ) {
          emit({ type: 'discard', turnId, reason: 'invalid_structure' });
          rejections.push({
            reason: 'invalid_structure',
            feedback: 'The JSON did not match the required structure.',
          });
          feedback = 'Return a JSON object exactly matching the output specification.';
          continue;
        }
        throw err;
      }

      const rejection = this.deterministicChecks(output, spec, speaker, allowed, memory);
      let verdict: ConsistencyVerdict | 'unavailable' | null = null;
      if (!rejection) verdict = await this.consistencyCheck(ctx, speaker, output, allowed);
      const consistencyRejection =
        verdict && verdict !== 'unavailable' && verdict.verdict === 'regenerate'
          ? {
              reason: 'inconsistent',
              feedback: verdict.issues.map((i) => `- ${i.type}: ${i.detail}`).join('\n'),
            }
          : null;
      const problem = rejection ?? consistencyRejection;
      if (problem) {
        rejections.push(problem);
        emit({ type: 'discard', turnId, reason: problem.reason });
        feedback = problem.feedback;
        continue;
      }
      return this.accept(
        ctx,
        round,
        spec,
        speaker,
        output,
        allowed,
        replyTo,
        {
          attempts: attempt,
          rejections: rejections.map((r) => r.reason),
          consistency: verdict === 'unavailable' ? 'unavailable' : 'passed',
          promptVersion: prompt.version,
          isExtrapolation: output.isExtrapolation,
          plannedObjection,
        },
        emit,
        turnId,
      );
    }
    throw new AppError(
      'AI_OUTPUT_INVALID',
      'We could not produce a turn that is consistent with the sources. Please try again.',
      {
        details: { reasons: rejections.map((r) => r.reason) },
      },
    );
  }

  /** Evidence the speaker may cite: their own pool plus shared (user-input) evidence. */
  private evidenceFor(ctx: DebateContext, speakerId: string): EvidenceItem[] {
    const own = ctx.evidence.filter((e) => e.characterId === speakerId);
    const shared = ctx.evidence.filter((e) => e.characterId === null);
    const ownCap = Math.max(4, this.evidencePerTurn - Math.min(3, shared.length));
    return [
      ...own.slice(0, ownCap),
      ...shared.slice(0, this.evidencePerTurn - Math.min(own.length, ownCap)),
    ];
  }

  private resolveReplyTo(ctx: DebateContext, spec: TurnSpec): StoredMessage | null {
    const r = spec.replyTo;
    if (!r) return null;
    switch (r.kind) {
      case 'opening_of':
        return (
          ctx.messages.find(
            (m) =>
              m.phase === 'OPENING' &&
              m.speaker.type === 'character' &&
              m.speaker.characterId === r.characterId,
          ) ?? null
        );
      case 'turn':
        return ctx.messages.find((m) => m.turnKey === r.key) ?? null;
      case 'phase_turn': {
        const round = [...ctx.rounds].reverse().find((x) => x.phase === r.phase);
        return round
          ? (ctx.messages.find((m) => m.turnKey === `${round.number}:${r.index}`) ?? null)
          : null;
      }
      case 'user_message':
        return ctx.messages.find((m) => m.id === r.messageId) ?? null;
    }
  }

  /** §23: generate candidate objections, rank them in code, keep the strongest. */
  private async strongestObjection(
    ctx: DebateContext,
    challenger: SpeakerProfile,
    target: StoredMessage,
  ): Promise<string | null> {
    if (target.speaker.type !== 'character' || !target.argument) return null;
    const targetProfile = ctx.speakers.get(target.speaker.characterId);
    if (!targetProfile) return null;
    const prompt = objectionGeneratorPrompt.build({
      language: ctx.debate.language,
      challenger: {
        name: challenger.character.displayName,
        perspective: challenger.participant.perspectiveLabel,
        worldview: challenger.character.worldviewSummary,
      },
      target: {
        name: targetProfile.character.displayName,
        perspective: targetProfile.participant.perspectiveLabel,
        speech: target.content,
        claim: target.argument.claim,
        premises: target.argument.premises,
        assumptions: target.argument.assumptions,
      },
    });
    try {
      const { data } = await generateStructured(
        this.gateway,
        {
          tier: 'fast',
          operation: 'debate.objections',
          promptVersion: prompt.version,
          system: prompt.system,
          messages: prompt.messages,
          maxOutputTokens: 1500,
          trace: { debateId: ctx.debate.id },
        },
        ObjectionCandidatesSchema,
      );
      return selectStrongestObjection(data.candidates)?.text ?? null;
    } catch (err) {
      if (err instanceof LLMError || (err instanceof AppError && err.code === 'AI_OUTPUT_INVALID'))
        return null;
      throw err;
    }
  }

  private promptInput(
    ctx: DebateContext,
    round: RoundRow,
    spec: TurnSpec,
    speaker: SpeakerProfile,
    evidence: EvidenceItem[],
    replyTo: StoredMessage | null,
    plannedObjection: string | null,
    feedback: string | null,
  ): TurnPromptInput {
    const axis = spec.axisId
      ? (ctx.plan.disagreementAxes.find((a) => a.id === spec.axisId) ?? null)
      : null;
    const name = (id: string) => ctx.speakers.get(id)?.character.displayName ?? id;
    const c = speaker.character;
    return {
      language: ctx.debate.language,
      phaseLabel: PHASE_LABEL[round.phase],
      move: spec.move,
      instruction: spec.instruction,
      roundNumber: round.number,
      speaker: {
        characterId: c.id,
        name: c.displayName,
        representation: c.representation,
        lifespan: speaker.lifespan,
        era: c.era,
        perspective: speaker.participant.perspectiveLabel,
        worldview: c.worldviewSummary,
        positions: c.knownPositions.map((p) => ({
          topic: p.topic,
          statement: p.statement,
          kind: p.knowledgeKind,
        })),
        constraints: speaker.constraints,
      },
      otherParticipants: ctx.participants
        .filter((p) => p.characterId !== c.id)
        .map((p) => ({
          characterId: p.characterId,
          name: name(p.characterId),
          perspective: p.perspectiveLabel,
        })),
      addressed: spec.addressedIds.map((id) => ({ id, name: name(id) })),
      topic: {
        title: ctx.analysis.title,
        summary: ctx.analysis.summary,
        claims: ctx.analysis.claims.map((x) => ({ id: x.id, kind: x.kind, text: x.text })),
      },
      axis: axis ? { id: axis.id, axis: axis.axis, description: axis.description } : null,
      evidence: evidence.map((e) => ({
        label: e.label,
        kind: e.knowledgeKind,
        citation: citationTag(e),
        text: e.content,
      })),
      transcript: ctx.messages
        .slice(-8)
        .map((m) => ({
          messageId: m.id,
          speaker: speakerName(ctx, m),
          move: m.move,
          text: m.content,
        })),
      replyTo: replyTo
        ? { messageId: replyTo.id, speaker: speakerName(ctx, replyTo), text: replyTo.content }
        : null,
      plannedObjection,
      memory: {
        previousClaims: ctx.debate.memory.arguments
          .slice(-20)
          .map((a) => ({ speaker: name(a.speakerId), claim: a.claim })),
        concessions: ctx.debate.memory.concessions
          .slice(-10)
          .map((x) => ({ speaker: name(x.speakerId), text: x.text })),
        userPositions: ctx.debate.memory.userPositions.slice(-3).map((u) => u.content),
      },
      revisionFeedback: feedback,
    };
  }

  private deterministicChecks(
    out: TurnOutput,
    spec: TurnSpec,
    speaker: SpeakerProfile,
    allowed: Map<string, EvidenceItem>,
    memory: ArgumentMemory,
  ): Rejection | null {
    const inSpeech = extractCitationLabels(out.speech);
    const referenced = [
      ...new Set([...inSpeech, ...out.argument.evidence.map((e) => e.evidenceId)]),
    ];
    const unknown = referenced.filter((l) => !allowed.has(l));
    if (unknown.length) {
      return {
        reason: 'invalid_citation',
        feedback: `You cited ${unknown.join(', ')}, which are not in the evidence list. Cite only: ${[...allowed.keys()].join(', ')}.`,
      };
    }
    if (spec.requiresCitation && inSpeech.length === 0) {
      return {
        reason: 'missing_citation',
        feedback: 'The speech must cite at least one evidence item inline, e.g. [E2].',
      };
    }
    const verdict = findWinnerLanguage(`${out.speech} ${out.argument.conclusion}`);
    if (verdict)
      return {
        reason: 'verdict_language',
        feedback: `Do not declare winners or settle the debate (found: "${verdict}").`,
      };
    if (speaker.character.representation === 'contemporary') {
      const certainty = findCertaintyClaim(out.speech);
      if (certainty)
        return {
          reason: 'certainty_claim',
          feedback: `Do not claim certainty about what a living person would say (found: "${certainty}").`,
        };
    }
    const redundancy = memory.check(out.argument.claim, out.argument.conclusion);
    if (redundancy.redundant && redundancy.similarTo) {
      return {
        reason: 'redundant',
        feedback: `Your claim repeats an argument already made ("${redundancy.similarTo.claim}"). Develop a genuinely different angle.`,
      };
    }
    return null;
  }

  private async consistencyCheck(
    ctx: DebateContext,
    speaker: SpeakerProfile,
    out: TurnOutput,
    allowed: Map<string, EvidenceItem>,
  ): Promise<ConsistencyVerdict | 'unavailable'> {
    const c = speaker.character;
    const cited = [
      ...new Set([
        ...extractCitationLabels(out.speech),
        ...out.argument.evidence.map((e) => e.evidenceId),
      ]),
    ];
    const prompt = consistencyCheckerPrompt.build({
      speaker: {
        name: c.displayName,
        representation: c.representation,
        lifespan: speaker.lifespan,
        positions: c.knownPositions.map((p) => ({
          topic: p.topic,
          statement: p.statement,
          kind: p.knowledgeKind,
        })),
        constraints: speaker.constraints,
      },
      citedEvidence: cited.flatMap((l) =>
        allowed.has(l) ? [{ label: l, text: (allowed.get(l) as EvidenceItem).content }] : [],
      ),
      turn: {
        speech: out.speech,
        claim: out.argument.claim,
        assumptions: out.argument.assumptions,
        concessions: out.concessions,
        isExtrapolation: out.isExtrapolation,
      },
      previousSpeechBySameSpeaker: ctx.messages
        .filter((m) => m.speaker.type === 'character' && m.speaker.characterId === c.id)
        .slice(-3)
        .map((m) => m.content),
    });
    try {
      const { data } = await generateStructured(
        this.gateway,
        {
          tier: 'fast',
          operation: 'debate.consistency',
          promptVersion: prompt.version,
          system: prompt.system,
          messages: prompt.messages,
          maxOutputTokens: 1200,
          trace: { debateId: ctx.debate.id },
        },
        ConsistencyVerdictSchema,
      );
      return data;
    } catch (err) {
      // Deterministic checks already passed; record that model verification did not run.
      if (err instanceof LLMError || (err instanceof AppError && err.code === 'AI_OUTPUT_INVALID'))
        return 'unavailable';
      throw err;
    }
  }

  private async accept(
    ctx: DebateContext,
    round: RoundRow,
    spec: TurnSpec,
    speaker: SpeakerProfile,
    out: TurnOutput,
    allowed: Map<string, EvidenceItem>,
    replyTo: StoredMessage | null,
    validation: Record<string, unknown>,
    emit: Emit,
    turnId: string,
  ): Promise<StoredMessage> {
    const id = uuidv7();
    const labelToSource = new Map([...allowed].map(([label, e]) => [label, e.source.id]));
    const argument = parseArgument(
      uuidv7(),
      out.argument,
      labelToSource,
      new Set(ctx.messages.map((m) => m.id)),
    );
    const labels = [
      ...new Set([
        ...extractCitationLabels(out.speech),
        ...argument.evidence.map((e) => e.evidenceId),
      ]),
    ];
    const inserted = await this.repos.messages.insert({
      id,
      debateId: ctx.debate.id,
      roundId: round.id,
      roundNumber: round.number,
      phase: round.phase,
      speakerType: 'character',
      characterId: speaker.character.id,
      move: spec.move,
      content: out.speech,
      replyToMessageId: replyTo?.id ?? null,
      addressedCharacterIds: spec.addressedIds,
      turnKey: spec.key,
      validation,
      argument,
      evidenceIds: labels.map((l) => (allowed.get(l) as EvidenceItem).id),
    });
    const all = await this.repos.messages.list(ctx.debate.id);
    const stored = all.find((m) => m.turnKey === spec.key) as StoredMessage;
    if (inserted) {
      ctx.debate.memory = updateMemory(
        ctx.debate.memory,
        stored,
        speaker.character.id,
        out,
        labels,
      );
      await this.repos.debates.setMemory(ctx.debate.id, ctx.debate.memory);
    }
    ctx.messages = all;
    emit({ type: 'message', turnId, message: stripTurnKey(stored) });
    return stored;
  }
}

export function stripTurnKey(m: StoredMessage) {
  const { turnKey: _k, ...rest } = m;
  return rest;
}

export function updateMemory(
  mem: DebateMemory,
  msg: StoredMessage,
  speakerId: string,
  out: TurnOutput,
  labels: string[],
): DebateMemory {
  const memory = new ArgumentMemory(mem.arguments);
  memory.remember(msg.id, speakerId, out.argument.claim, out.argument.conclusion);
  return {
    ...mem,
    arguments: [...memory.all].slice(-60),
    objections: [
      ...mem.objections,
      { messageId: msg.id, speakerId, text: out.strongestObjection.text },
    ].slice(-40),
    concessions: [
      ...mem.concessions,
      ...out.concessions.map((text) => ({ messageId: msg.id, speakerId, text })),
    ].slice(-30),
    unresolvedQuestions: pushUnique(mem.unresolvedQuestions, out.openQuestions, 20),
    usedEvidenceLabels: pushUnique(mem.usedEvidenceLabels, labels, 200),
  };
}
