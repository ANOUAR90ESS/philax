import type { Argument } from '@philax/types';

/** Raw argument structure as produced by a turn (before ids are assigned). */
export interface RawArgument {
  claim: string;
  premises: string[];
  conclusion: string;
  assumptions: string[];
  evidence: { evidenceId: string; use: string }[];
  objections: { text: string; targetsMessageId: string | null }[];
}

/**
 * Normalizes a generated argument into the domain model (§22): trims text,
 * removes duplicate premises/assumptions, keeps only evidence ids from the
 * allowed pool, and derives sourceReferences from that evidence.
 */
export function parseArgument(
  id: string,
  raw: RawArgument,
  allowedEvidence: ReadonlyMap<string, string>,
  knownMessageIds: ReadonlySet<string>,
): Argument {
  const clean = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];
  const evidence = raw.evidence
    .map((e) => ({ evidenceId: e.evidenceId.trim(), use: e.use.trim() }))
    .filter((e) => allowedEvidence.has(e.evidenceId))
    .filter((e, i, arr) => arr.findIndex((x) => x.evidenceId === e.evidenceId) === i);
  return {
    id,
    claim: raw.claim.trim(),
    premises: clean(raw.premises),
    conclusion: raw.conclusion.trim(),
    assumptions: clean(raw.assumptions),
    evidence,
    objections: raw.objections.map((o) => ({
      text: o.text.trim(),
      targetsMessageId:
        o.targetsMessageId && knownMessageIds.has(o.targetsMessageId) ? o.targetsMessageId : null,
    })),
    sourceReferences: [
      ...new Set(evidence.map((e) => allowedEvidence.get(e.evidenceId) as string)),
    ],
  };
}
