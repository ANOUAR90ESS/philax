import {
  TRUST_RULES,
  applicationState,
  truncate,
  untrusted,
  versionId,
  type PromptTemplate,
} from '../framework';

export interface ConsistencyCheckerInput {
  speaker: {
    name: string;
    representation: string;
    lifespan: string;
    positions: { topic: string; statement: string; kind: string }[];
    constraints: string[];
  };
  citedEvidence: { label: string; text: string }[];
  turn: {
    speech: string;
    claim: string;
    assumptions: string[];
    concessions: string[];
    isExtrapolation: boolean;
  };
  previousSpeechBySameSpeaker: string[];
}

const ID = 'consistency-checker';
const VERSION = 1;

export const consistencyCheckerPrompt: PromptTemplate<ConsistencyCheckerInput> = {
  id: ID,
  version: VERSION,
  build(input) {
    const s = input.speaker;
    const system = `You verify a generated debate turn before it is shown. You are strict but fair: flag real problems only.

${TRUST_RULES}

## Check the turn for
- contradicts_documented_position: it asserts the opposite of a documented position of ${s.name} without acknowledging the tension.
- anachronism: ${s.representation === 'historical' ? `it presents ${s.name} (${s.lifespan}) as knowing later events or technologies without framing it as an extrapolation` : 'not applicable to contemporary figures unless a date-based impossibility is claimed'}.
- fabricated_quotation: it presents words in quotation marks as ${s.name}'s actual words, or names works/pages that do not appear in the evidence.
- misattributed_evidence: an [E#] citation is used for something that evidence text does not support.
- capitulation: it abandons a documented position to agree with others or the user without a documented basis.
- verdict_language: it declares a winner or that the debate is settled.
- self_contradiction: it contradicts this speaker's earlier turns in the debate without explanation.
- constraint_violation: it breaks one of the listed constraints.

If there are no real problems the verdict is "accept". If any problem would mislead a reader about what ${s.name} documented or about the sources, the verdict is "regenerate".

## Output
Return ONLY JSON: {"verdict": "accept" | "regenerate", "issues": [{"type": string, "detail": string}]}`;
    const state = applicationState({
      speaker: s.name,
      documentedPositions: s.positions,
      constraints: s.constraints,
      isExtrapolationDeclared: input.turn.isExtrapolation,
    });
    const parts = [
      state,
      untrusted(
        'cited_evidence',
        input.citedEvidence.map((e) => `[${e.label}] ${truncate(e.text, 1500)}`).join('\n\n') ||
          '(none)',
      ),
      untrusted(
        'turn',
        `Speech: ${input.turn.speech}\nClaim: ${input.turn.claim}\nAssumptions: ${input.turn.assumptions.join(' | ')}\nConcessions: ${input.turn.concessions.join(' | ') || '(none)'}`,
      ),
    ];
    if (input.previousSpeechBySameSpeaker.length) {
      parts.push(
        untrusted(
          'earlier_turns_by_speaker',
          input.previousSpeechBySameSpeaker.map((t) => truncate(t, 1200)).join('\n---\n'),
        ),
      );
    }
    return {
      version: versionId(ID, VERSION),
      system,
      messages: [{ role: 'user', content: parts.join('\n\n') }],
    };
  },
};
