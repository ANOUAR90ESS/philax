import { z } from 'zod';
import { ArgumentSchema } from './arguments';
import { CharacterSummarySchema } from './characters';
import { KnowledgeKindSchema, SourceTypeSchema } from './sources';
import { ClaimSchema, TensionSchema } from './topics';

export const DEBATE_MODES = ['debate', 'challenge'] as const;
export const DebateModeSchema = z.enum(DEBATE_MODES);
export type DebateMode = z.infer<typeof DebateModeSchema>;

export const DEBATE_PHASES = [
  'DEBATE_CREATED',
  'TOPIC_ANALYZED',
  'CHARACTERS_SELECTED',
  'DEBATE_PLANNED',
  'OPENING',
  'CHALLENGE',
  'RESPONSE',
  'CROSS_EXAMINATION',
  'DEEP_DISAGREEMENT',
  'OPEN_QUESTION',
  'USER_CHALLENGE',
  'SYNTHESIS',
  'COMPLETED',
  'FAILED',
] as const;
export const DebatePhaseSchema = z.enum(DEBATE_PHASES);
export type DebatePhase = z.infer<typeof DebatePhaseSchema>;

/** Phases that correspond to a generated round of character turns. */
export const ROUND_PHASES = [
  'OPENING',
  'CHALLENGE',
  'RESPONSE',
  'CROSS_EXAMINATION',
  'DEEP_DISAGREEMENT',
  'OPEN_QUESTION',
] as const;
export const RoundPhaseSchema = z.enum([...ROUND_PHASES, 'USER_EXCHANGE']);
export type RoundPhase = z.infer<typeof RoundPhaseSchema>;

export const PARTICIPANT_ROLES = ['debater', 'supporter', 'opponent', 'alternative'] as const;
export const ParticipantRoleSchema = z.enum(PARTICIPANT_ROLES);
export type ParticipantRole = z.infer<typeof ParticipantRoleSchema>;

export const DEBATE_MOVES = [
  'assert',
  'challenge',
  'respond',
  'question',
  'answer',
  'concede',
  'reframe',
] as const;
export const DebateMoveSchema = z.enum(DEBATE_MOVES);
export type DebateMove = z.infer<typeof DebateMoveSchema>;

export const CitationSchema = z.object({
  evidenceId: z.string(),
  sourceId: z.uuid(),
  sourceTitle: z.string(),
  author: z.string().nullable(),
  locator: z.string().nullable(),
  url: z.string().nullable(),
  sourceType: SourceTypeSchema,
  knowledgeKind: KnowledgeKindSchema,
});
export type Citation = z.infer<typeof CitationSchema>;

export const SpeakerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('character'), characterId: z.uuid() }),
  z.object({ type: z.literal('user') }),
]);
export type Speaker = z.infer<typeof SpeakerSchema>;

export const DebateMessageSchema = z.object({
  id: z.uuid(),
  debateId: z.uuid(),
  roundNumber: z.number().int().min(1),
  phase: RoundPhaseSchema,
  speaker: SpeakerSchema,
  move: DebateMoveSchema,
  content: z.string(),
  argument: ArgumentSchema.nullable(),
  citations: z.array(CitationSchema),
  replyToMessageId: z.uuid().nullable(),
  addressedCharacterIds: z.array(z.uuid()),
  createdAt: z.string(),
});
export type DebateMessage = z.infer<typeof DebateMessageSchema>;

export const DebateParticipantSchema = z.object({
  character: CharacterSummarySchema,
  role: ParticipantRoleSchema,
  perspective: z.object({ slug: z.string(), label: z.string() }),
  selectionReason: z.string(),
  /** Stable index used by the UI for the participant's visual identity. */
  seat: z.number().int().min(0),
});
export type DebateParticipant = z.infer<typeof DebateParticipantSchema>;

export const DebateRoundSchema = z.object({
  number: z.number().int().min(1),
  phase: RoundPhaseSchema,
  status: z.enum(['pending', 'generating', 'completed']),
});
export type DebateRound = z.infer<typeof DebateRoundSchema>;

export const SynthesisSchema = z.object({
  agreements: z.array(z.object({ point: z.string(), participantIds: z.array(z.uuid()) })),
  disagreements: z.array(
    z.object({
      point: z.string(),
      axis: TensionSchema.shape.axis,
      whyTheyDisagree: z.string(),
      positions: z.array(z.object({ characterId: z.uuid(), stance: z.string() })),
    }),
  ),
  assumptions: z.array(z.object({ characterId: z.uuid(), assumptions: z.array(z.string()) })),
  keyArguments: z.array(
    z.object({ characterId: z.uuid(), claim: z.string(), messageId: z.uuid().nullable() }),
  ),
  unresolvedQuestions: z.array(z.string()),
  strongestUnresolvedQuestion: z.string(),
  userPosition: z.string().nullable(),
  sources: z.array(CitationSchema),
});
export type Synthesis = z.infer<typeof SynthesisSchema>;

export const ChallengeFramingSchema = z.object({
  idea: z.string(),
  hiddenAssumptions: z.array(z.string()),
  strongestObjection: z.string(),
});
export type ChallengeFraming = z.infer<typeof ChallengeFramingSchema>;

export const DebateViewSchema = z.object({
  id: z.uuid(),
  mode: DebateModeSchema,
  phase: DebatePhaseSchema,
  input: z.object({
    type: z.enum(['text', 'url']),
    preview: z.string(),
    sourceUrl: z.string().nullable(),
  }),
  topic: z
    .object({
      title: z.string(),
      summary: z.string(),
      concepts: z.array(z.string()),
      questions: z.array(z.string()),
      claims: z.array(ClaimSchema),
      tensions: z.array(TensionSchema),
    })
    .nullable(),
  participants: z.array(DebateParticipantSchema),
  rounds: z.array(DebateRoundSchema),
  messages: z.array(DebateMessageSchema),
  disagreementAxes: z.array(z.string()),
  challenge: ChallengeFramingSchema.nullable(),
  synthesis: SynthesisSchema.nullable(),
  canUserJoin: z.boolean(),
  nextAction: z.enum(['advance', 'synthesize', 'none']),
  saved: z.boolean(),
  language: z.string(),
  createdAt: z.string(),
});
export type DebateView = z.infer<typeof DebateViewSchema>;

export const DebateListItemSchema = z.object({
  id: z.uuid(),
  mode: DebateModeSchema,
  title: z.string(),
  phase: DebatePhaseSchema,
  saved: z.boolean(),
  createdAt: z.string(),
});
export type DebateListItem = z.infer<typeof DebateListItemSchema>;

/** Server-Sent Events emitted while a round is generated. */
export type DebateStreamEvent =
  | { type: 'round_started'; roundNumber: number; phase: RoundPhase }
  | { type: 'turn_started'; turnId: string; characterId: string }
  | { type: 'draft'; turnId: string; delta: string }
  | { type: 'discard'; turnId: string; reason: string }
  | { type: 'message'; turnId: string; message: DebateMessage }
  | { type: 'round_completed'; roundNumber: number }
  | { type: 'synthesis'; synthesis: Synthesis }
  | { type: 'state'; debate: DebateView }
  | { type: 'error'; code: string; message: string; errorId: string };
