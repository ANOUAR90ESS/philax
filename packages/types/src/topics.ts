import { z } from 'zod';

export const CLAIM_KINDS = [
  'claim',
  'evidence',
  'assumption',
  'question',
  'value_judgment',
  'prediction',
  'definition',
] as const;
export const ClaimKindSchema = z.enum(CLAIM_KINDS);
export type ClaimKind = z.infer<typeof ClaimKindSchema>;

export const ClaimSchema = z.object({
  id: z.string(),
  kind: ClaimKindSchema,
  text: z.string().min(1).max(600),
  /** Ids of other claims this one depends on (e.g. an assumption underlying a claim). */
  relatedClaimIds: z.array(z.string()).default([]),
});
export type Claim = z.infer<typeof ClaimSchema>;

export const TensionSchema = z.object({
  description: z.string().min(1).max(600),
  /** What the disagreement is fundamentally about. */
  axis: z.enum(['assumptions', 'definitions', 'values', 'evidence', 'priorities', 'schools']),
  poles: z.array(z.string().min(1).max(200)).min(2).max(4),
});
export type Tension = z.infer<typeof TensionSchema>;

export const PerspectiveRequirementSchema = z.object({
  /** Slug of a perspective in the catalog, or a free description if none fits. */
  perspectiveSlug: z.string().nullable(),
  description: z.string().min(1).max(400),
  reason: z.string().min(1).max(400),
});
export type PerspectiveRequirement = z.infer<typeof PerspectiveRequirementSchema>;

export const TopicAnalysisSchema = z.object({
  title: z.string().min(1).max(200),
  summary: z.string().min(1).max(1500),
  language: z.string().min(2).max(35),
  domains: z.array(z.string().min(1).max(60)).min(1).max(8),
  concepts: z.array(z.string().min(1).max(80)).min(1).max(15),
  claims: z.array(ClaimSchema).min(1).max(20),
  questions: z.array(z.string().min(1).max(400)).min(1).max(8),
  tensions: z.array(TensionSchema).max(8),
  requiredPerspectives: z.array(PerspectiveRequirementSchema).min(2).max(8),
  /** False when the input is purely factual and does not admit reasonable disagreement. */
  admitsReasonableDisagreement: z.boolean(),
});
export type TopicAnalysis = z.infer<typeof TopicAnalysisSchema>;
