import {
  TRUST_RULES,
  applicationState,
  languageInstruction,
  truncate,
  untrusted,
  versionId,
  type PromptTemplate,
} from '../framework';

export interface SynthesisInput {
  language: string;
  topicTitle: string;
  participants: { characterId: string; name: string; perspective: string }[];
  messages: {
    messageId: string;
    speaker: string;
    speakerId: string | null;
    move: string;
    text: string;
    claim: string | null;
    assumptions: string[];
  }[];
  userPositions: string[];
  axes: { id: string; axis: string; description: string }[];
}

const ID = 'synthesis';
const VERSION = 1;

export const synthesisPrompt: PromptTemplate<SynthesisInput> = {
  id: ID,
  version: VERSION,
  build(input) {
    const system = `You write the closing synthesis of a structured debate. You map the disagreement; you do not resolve it.

${TRUST_RULES}

## Rules
- There is no winner. Never say who is right, who argued best, or that the question is settled. No scores, rankings or verdicts.
- agreements: points participants genuinely share (list participantIds). It is fine if there are few.
- disagreements: the key disagreements, each with its axis (assumptions | definitions | values | evidence | priorities | schools), "whyTheyDisagree" (the underlying reason, not a restatement), and each relevant participant's stance.
- assumptions: for each participant, the underlying assumptions their arguments rested on.
- keyArguments: the most important argument of each participant, with the messageId where it was made.
- unresolvedQuestions and strongestUnresolvedQuestion: what remains genuinely open.
- If the user took part, treat their position as one more position in the map, neither endorsing nor dismissing it.
- Base everything on the transcript; use only participant ids and message ids that appear in it.
- ${languageInstruction(input.language)}

## Output
Return ONLY JSON: {"agreements": [{"point": string, "participantIds": [string]}], "disagreements": [{"point": string, "axis": string, "whyTheyDisagree": string, "positions": [{"characterId": string, "stance": string}]}], "assumptions": [{"characterId": string, "assumptions": [string]}], "keyArguments": [{"characterId": string, "claim": string, "messageId": string}], "unresolvedQuestions": [string], "strongestUnresolvedQuestion": string}`;
    const state = applicationState({
      participants: input.participants,
      disagreementAxes: input.axes,
    });
    const transcript = untrusted(
      'transcript',
      input.messages
        .map(
          (m) =>
            `(${m.messageId}) ${m.speaker}${m.speakerId ? ` [${m.speakerId}]` : ''} — ${m.move}:\n${truncate(m.text, 1400)}${m.claim ? `\nClaim: ${m.claim}` : ''}${m.assumptions.length ? `\nAssumptions: ${m.assumptions.join(' | ')}` : ''}`,
        )
        .join('\n\n'),
      { topic: input.topicTitle },
    );
    const parts = [state, transcript];
    if (input.userPositions.length)
      parts.push(untrusted('user_positions', input.userPositions.join('\n---\n')));
    return {
      version: versionId(ID, VERSION),
      system,
      messages: [{ role: 'user', content: parts.join('\n\n') }],
    };
  },
};
