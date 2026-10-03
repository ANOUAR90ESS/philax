import {
  TRUST_RULES,
  applicationState,
  languageInstruction,
  truncate,
  untrusted,
  versionId,
  type BuiltPrompt,
} from '../framework';

export interface TurnPromptInput {
  language: string;
  phaseLabel: string;
  move: string;
  instruction: string;
  roundNumber: number;
  speaker: {
    characterId: string;
    name: string;
    representation: 'historical' | 'contemporary';
    lifespan: string;
    era: string;
    perspective: string;
    worldview: string;
    positions: { topic: string; statement: string; kind: string }[];
    constraints: string[];
  };
  otherParticipants: { characterId: string; name: string; perspective: string }[];
  addressed: { id: string; name: string }[];
  topic: { title: string; summary: string; claims: { id: string; kind: string; text: string }[] };
  axis: { id: string; axis: string; description: string } | null;
  evidence: { label: string; kind: string; citation: string; text: string }[];
  transcript: { messageId: string; speaker: string; move: string; text: string }[];
  replyTo: { messageId: string; speaker: string; text: string } | null;
  plannedObjection: string | null;
  memory: {
    previousClaims: { speaker: string; claim: string }[];
    concessions: { speaker: string; text: string }[];
    userPositions: string[];
  };
  /** Feedback from a rejected previous attempt (regeneration). */
  revisionFeedback: string | null;
}

export const TURN_OUTPUT_SPEC = `{"speech": string, "argument": {"claim": string, "premises": [string], "conclusion": string, "assumptions": [string], "evidence": [{"evidenceId": "E#", "use": string}], "objections": [{"text": string, "targetsMessageId": string | null}]}, "strongestObjection": {"text": string, "response": string}, "concessions": [string], "openQuestions": [string], "isExtrapolation": boolean}`;

/** Shared builder for all turn prompts so debate rules are identical across phases. */
export function buildTurnPrompt(
  id: string,
  version: number,
  input: TurnPromptInput,
  phaseGuidance: string,
): BuiltPrompt {
  const s = input.speaker;
  const notice =
    s.representation === 'contemporary'
      ? `${s.name} is a contemporary figure. Use only their publicly documented statements and works. Never claim they hold a view they have not published.`
      : `${s.name} (${s.lifespan}) is a historical figure. This is a simulated reconstruction based on documented works and positions, not their actual words.`;
  const system = `You voice a reconstruction of the documented ideas of ${s.name} in a structured debate. You are not ${s.name}; you reconstruct how their documented positions bear on the topic.

${TRUST_RULES}

## Who you reconstruct
- ${notice}
- Era: ${s.era}. Perspective in this debate: ${s.perspective}.
- Worldview (curated summary): ${s.worldview}
- Documented positions (curated knowledge base):
${s.positions.map((p) => `  - [${p.kind}] ${p.topic}: ${p.statement}`).join('\n')}
- Constraints you must obey:
${s.constraints.map((c) => `  - ${c}`).join('\n')}

## Debate rules
1. Argue only from the documented positions above and the numbered evidence. Do not contradict a documented position unless you explicitly explain the tension.
2. Cite evidence inline with markers like [E3], using ONLY labels from the evidence list. Never invent sources, works, page numbers or quotations. Do not put words in quotation marks as if they were ${s.name}'s actual words; paraphrase.
3. If you apply these ideas to something after their lifetime or outside their documented work, say so explicitly in the speech and set "isExtrapolation": true.
4. Keep the disagreement alive. Do not drift into agreement with other participants or with the user to be agreeable. Concede only specific points your documented position genuinely allows, and list them in "concessions".
5. Never declare a winner, rank participants, or say the question is settled.
6. Add something new. Do not restate claims already made in this debate (listed in the application state); find a different angle.
7. The turn must make clear: the claim, why ${s.name}'s view supports it, the assumption behind it, the evidence, the strongest objection to it, and how ${s.name}'s view answers that objection ("strongestObjection").
8. Speech: 90–220 words, first person, measured and precise, addressing other participants by name. No headings or bullet points.
9. ${languageInstruction(input.language)}

## This turn
Phase: ${input.phaseLabel}. Move: ${input.move}.
${input.instruction}
${phaseGuidance}

## Output
Return ONLY a JSON object, with "speech" as the FIRST key:
${TURN_OUTPUT_SPEC}`;

  const state = applicationState({
    round: input.roundNumber,
    phase: input.phaseLabel,
    move: input.move,
    speaker: { characterId: s.characterId, name: s.name },
    addressedParticipants: input.addressed,
    otherParticipants: input.otherParticipants,
    disagreementAxis: input.axis,
    allowedEvidenceLabels: input.evidence.map((e) => e.label),
    plannedStrongestObjection: input.plannedObjection,
    claimsAlreadyMade: input.memory.previousClaims,
    concessionsSoFar: input.memory.concessions,
  });

  const parts = [
    state,
    untrusted(
      'topic',
      `${input.topic.title}\n${input.topic.summary}\n\n${input.topic.claims.map((c) => `${c.id} (${c.kind}): ${c.text}`).join('\n')}`,
    ),
    untrusted(
      'evidence',
      input.evidence
        .map((e) => `[${e.label}] (${e.kind}; ${e.citation})\n${truncate(e.text, 1500)}`)
        .join('\n\n'),
    ),
  ];
  if (input.transcript.length) {
    parts.push(
      untrusted(
        'transcript',
        input.transcript
          .map((m) => `(${m.messageId}) ${m.speaker} — ${m.move}:\n${truncate(m.text, 1500)}`)
          .join('\n\n'),
      ),
    );
  }
  if (input.replyTo)
    parts.push(
      untrusted(
        'message_to_answer',
        `(${input.replyTo.messageId}) ${input.replyTo.speaker}:\n${truncate(input.replyTo.text, 2500)}`,
      ),
    );
  if (input.memory.userPositions.length)
    parts.push(
      untrusted(
        'user_positions',
        input.memory.userPositions.map((p) => `- ${truncate(p, 600)}`).join('\n'),
      ),
    );
  if (input.revisionFeedback) {
    parts.push(
      `Your previous draft for this turn was rejected by validation. Fix these problems and write a new turn:\n${input.revisionFeedback}`,
    );
  }
  return {
    version: versionId(id, version),
    system,
    messages: [{ role: 'user', content: parts.join('\n\n') }],
  };
}
