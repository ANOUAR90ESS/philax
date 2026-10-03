import { z } from 'zod';

export const EvidenceSchema = z.object({
  /** Id of the retrieved chunk inside the debate's evidence pool. */
  evidenceId: z.string(),
  /** How the evidence is used in the argument. */
  use: z.string().min(1).max(300),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const ObjectionSchema = z.object({
  text: z.string().min(1).max(600),
  /** Message id the objection targets, if it answers a prior turn. */
  targetsMessageId: z.string().nullable().default(null),
});
export type Objection = z.infer<typeof ObjectionSchema>;

export const ArgumentSchema = z.object({
  id: z.string(),
  claim: z.string().min(1).max(500),
  premises: z.array(z.string().min(1).max(400)).min(1).max(6),
  conclusion: z.string().min(1).max(500),
  assumptions: z.array(z.string().min(1).max(400)).max(6),
  evidence: z.array(EvidenceSchema).max(6),
  objections: z.array(ObjectionSchema).max(4),
  sourceReferences: z.array(z.string()).max(8),
});
export type Argument = z.infer<typeof ArgumentSchema>;
