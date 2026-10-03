import { z } from 'zod';

/** Debate plan produced once during preparation (§19, Debate Planning step). */
export const DebatePlanSchema = z.object({
  disagreementAxes: z
    .array(
      z.object({
        id: z.string().min(1).max(10),
        axis: z.enum(['assumptions', 'definitions', 'values', 'evidence', 'priorities', 'schools']),
        description: z.string().min(10).max(400),
        between: z.array(z.string()).min(2),
      }),
    )
    .min(1)
    .max(5),
  openings: z
    .array(
      z.object({
        characterId: z.string(),
        angle: z.string().min(5).max(400),
        claimIds: z.array(z.string()).max(4),
      }),
    )
    .min(2),
  challenges: z
    .array(z.object({ challengerId: z.string(), targetId: z.string(), axisId: z.string() }))
    .min(1)
    .max(6),
  crossExaminations: z
    .array(
      z.object({ askerId: z.string(), responderId: z.string(), focus: z.string().min(5).max(300) }),
    )
    .min(1)
    .max(3),
  deepestDisagreement: z.object({ axisId: z.string(), question: z.string().min(10).max(400) }),
  openQuestion: z.string().min(10).max(400),
});
export type DebatePlan = z.infer<typeof DebatePlanSchema>;

/** Referential checks: every id must be a participant / axis / claim of this debate. */
export function validatePlan(
  plan: DebatePlan,
  participantIds: ReadonlySet<string>,
  claimIds: ReadonlySet<string>,
): string | null {
  const axes = new Set(plan.disagreementAxes.map((a) => a.id));
  if (axes.size !== plan.disagreementAxes.length) return 'disagreementAxes ids must be unique';
  for (const a of plan.disagreementAxes) {
    for (const p of a.between)
      if (!participantIds.has(p)) return `axis ${a.id} references unknown participant ${p}`;
  }
  const opened = new Set(plan.openings.map((o) => o.characterId));
  for (const p of participantIds) if (!opened.has(p)) return `missing opening for participant ${p}`;
  for (const o of plan.openings) {
    if (!participantIds.has(o.characterId))
      return `opening references unknown participant ${o.characterId}`;
    for (const c of o.claimIds)
      if (!claimIds.has(c)) return `opening references unknown claim ${c}`;
  }
  for (const c of plan.challenges) {
    if (!participantIds.has(c.challengerId) || !participantIds.has(c.targetId))
      return 'challenge references unknown participant';
    if (c.challengerId === c.targetId) return 'a participant cannot challenge themselves';
    if (!axes.has(c.axisId)) return `challenge references unknown axis ${c.axisId}`;
  }
  const challenged = new Set(plan.challenges.map((c) => c.targetId));
  if (challenged.size < Math.min(2, participantIds.size))
    return 'challenges must target at least two different participants';
  for (const x of plan.crossExaminations) {
    if (!participantIds.has(x.askerId) || !participantIds.has(x.responderId))
      return 'cross-examination references unknown participant';
    if (x.askerId === x.responderId) return 'cross-examination needs two different participants';
  }
  if (!axes.has(plan.deepestDisagreement.axisId))
    return 'deepestDisagreement references unknown axis';
  return null;
}
