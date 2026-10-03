import { z } from 'zod';

export const TurnOutputSchema = z.object({
  speech: z.string().min(40).max(2600),
  argument: z.object({
    claim: z.string().min(5).max(500),
    premises: z.array(z.string().min(2).max(400)).min(1).max(6),
    conclusion: z.string().min(2).max(500),
    assumptions: z.array(z.string().min(2).max(400)).max(6),
    evidence: z
      .array(z.object({ evidenceId: z.string().regex(/^E\d+$/), use: z.string().min(2).max(300) }))
      .max(6),
    objections: z
      .array(
        z.object({
          text: z.string().min(2).max(600),
          targetsMessageId: z.string().nullable().default(null),
        }),
      )
      .max(4),
  }),
  strongestObjection: z.object({
    text: z.string().min(5).max(600),
    response: z.string().min(5).max(800),
  }),
  concessions: z.array(z.string().min(2).max(400)).max(4),
  openQuestions: z.array(z.string().min(5).max(400)).max(3),
  isExtrapolation: z.boolean(),
});
export type TurnOutput = z.infer<typeof TurnOutputSchema>;

export const ObjectionCandidatesSchema = z.object({
  candidates: z
    .array(
      z.object({
        text: z.string().min(5).max(600),
        relevance: z.number().int().min(1).max(5),
        strength: z.number().int().min(1).max(5),
        targets: z.enum(['premise', 'assumption', 'evidence', 'conclusion', 'definition']),
      }),
    )
    .min(1)
    .max(6),
});

export const ConsistencyVerdictSchema = z.object({
  verdict: z.enum(['accept', 'regenerate']),
  issues: z
    .array(z.object({ type: z.string().min(2).max(60), detail: z.string().min(2).max(600) }))
    .max(10),
});
export type ConsistencyVerdict = z.infer<typeof ConsistencyVerdictSchema>;

const Axis = z.enum(['assumptions', 'definitions', 'values', 'evidence', 'priorities', 'schools']);

export const SynthesisOutputSchema = z.object({
  agreements: z
    .array(
      z.object({ point: z.string().min(3).max(500), participantIds: z.array(z.string()).min(1) }),
    )
    .max(8),
  disagreements: z
    .array(
      z.object({
        point: z.string().min(3).max(500),
        axis: Axis,
        whyTheyDisagree: z.string().min(10).max(800),
        positions: z
          .array(z.object({ characterId: z.string(), stance: z.string().min(2).max(500) }))
          .min(2),
      }),
    )
    .min(1)
    .max(8),
  assumptions: z
    .array(
      z.object({
        characterId: z.string(),
        assumptions: z.array(z.string().min(2).max(400)).min(1).max(6),
      }),
    )
    .min(1),
  keyArguments: z
    .array(
      z.object({
        characterId: z.string(),
        claim: z.string().min(3).max(500),
        messageId: z.string(),
      }),
    )
    .min(1),
  unresolvedQuestions: z.array(z.string().min(5).max(400)).min(1).max(8),
  strongestUnresolvedQuestion: z.string().min(5).max(400),
});
export type SynthesisOutput = z.infer<typeof SynthesisOutputSchema>;

export const ChallengeFramingOutputSchema = z.object({
  hiddenAssumptions: z.array(z.string().min(5).max(400)).min(2).max(5),
  objectionCandidates: ObjectionCandidatesSchema.shape.candidates,
  roles: z.object({ supporter: z.string(), opponent: z.string(), alternative: z.string() }),
});
export type ChallengeFramingOutput = z.infer<typeof ChallengeFramingOutputSchema>;
