import {
  TRUST_RULES,
  applicationState,
  languageInstruction,
  truncate,
  untrusted,
  versionId,
  type PromptTemplate,
} from '../framework';

export interface ChallengeFramingInput {
  language: string;
  idea: string;
  perspectives: { slug: string; label: string; description: string }[];
}

const ID = 'challenge-framing';
const VERSION = 1;

/** "Challenge my idea" (§27): hidden assumptions, objection candidates and role mapping. */
export const challengeFramingPrompt: PromptTemplate<ChallengeFramingInput> = {
  id: ID,
  version: VERSION,
  build(input) {
    const system = `You prepare a rigorous examination of an idea a user holds. You do not judge the idea true or false.

${TRUST_RULES}

## Task
- hiddenAssumptions: 2–5 assumptions the idea relies on without stating them.
- objectionCandidates: 3–5 serious objections to the idea, each rated "relevance" 1–5 and "strength" 1–5, with "targets" one of premise | assumption | evidence | conclusion | definition. Prefer objections to assumptions and evidence over flat denials.
- roles: map each role to ONE perspective slug from the application state (all different): "supporter" can make the strongest case FOR the idea, "opponent" the strongest case AGAINST it, "alternative" reframes the question from a different angle.
- ${languageInstruction(input.language)}

## Output
Return ONLY JSON: {"hiddenAssumptions": [string], "objectionCandidates": [{"text": string, "relevance": number, "strength": number, "targets": string}], "roles": {"supporter": string, "opponent": string, "alternative": string}}`;
    const state = applicationState({ perspectives: input.perspectives });
    return {
      version: versionId(ID, VERSION),
      system,
      messages: [
        {
          role: 'user',
          content: `${state}\n\nThe user's idea:\n${untrusted('user_idea', truncate(input.idea, 4000))}`,
        },
      ],
    };
  },
};
