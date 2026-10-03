import type { RememberedArgument } from '@philax/arguments';

/** Persisted debate memory (§66), updated after every accepted turn. */
export interface DebateMemory {
  arguments: RememberedArgument[];
  objections: { messageId: string; speakerId: string; text: string }[];
  concessions: { messageId: string; speakerId: string; text: string }[];
  unresolvedQuestions: string[];
  usedEvidenceLabels: string[];
  contradictionsFlagged: { messageId: string; detail: string }[];
  userPositions: { messageId: string; content: string }[];
  expectedDisagreement: string | null;
}

export function emptyMemory(): DebateMemory {
  return {
    arguments: [],
    objections: [],
    concessions: [],
    unresolvedQuestions: [],
    usedEvidenceLabels: [],
    contradictionsFlagged: [],
    userPositions: [],
    expectedDisagreement: null,
  };
}

export function normalizeMemory(raw: unknown): DebateMemory {
  return {
    ...emptyMemory(),
    ...((raw && typeof raw === 'object' ? raw : {}) as Partial<DebateMemory>),
  };
}

/** Bounded list helper: keeps the most recent `max` unique entries. */
export function pushUnique(list: string[], items: string[], max: number): string[] {
  const out = [...list];
  for (const i of items.map((x) => x.trim()).filter(Boolean)) if (!out.includes(i)) out.push(i);
  return out.slice(-max);
}
