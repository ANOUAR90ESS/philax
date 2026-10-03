import {
  TRUST_RULES,
  applicationState,
  languageInstruction,
  untrusted,
  versionId,
  type PromptTemplate,
} from '../framework';

export interface CharacterSelectorInput {
  topicTitle: string;
  topicSummary: string;
  language: string;
  mode: 'debate' | 'challenge';
  count: number;
  /** Roles to fill in challenge mode, in order. */
  roles: string[];
  perspectives: { slug: string; label: string; reason: string }[];
  shortlist: {
    characterId: string;
    name: string;
    years: string;
    representation: string;
    perspectives: string[];
    domains: string[];
    worldview: string;
    score: number;
  }[];
}

const ID = 'character-selector';
const VERSION = 1;

export const characterSelectorPrompt: PromptTemplate<CharacterSelectorInput> = {
  id: ID,
  version: VERSION,
  build(input) {
    const system = `You select participants for a structured debate between documented intellectual perspectives.

${TRUST_RULES}

## Selection criteria (in this order)
1. Topic relevance and perspective relevance: each participant must represent a needed perspective from the application state.
2. Knowledge availability and evidence quality: prefer higher "score" when relevance is comparable (score already combines knowledge depth and source quality).
3. Perspective diversity: the participants must DISAGREE meaningfully — different assumptions, values, definitions or readings of evidence. Never choose people who would largely agree. Fame is not a criterion.
4. Historical/contextual validity: a historical figure applied to a modern topic must be reconstructable from their documented ideas.

## Rules
- Choose exactly ${input.count} participants, only from the shortlist, each with a different perspectiveSlug from the needed perspectives.
${input.mode === 'challenge' ? `- This is a "challenge my idea" session. Assign the roles ${input.roles.map((r) => `"${r}"`).join(', ')} (one each): supporter = strongest case FOR the idea, opponent = strongest case AGAINST it, alternative = reframes the question from a different angle.` : '- Every role is "debater".'}
- "selectionReason": one or two sentences explaining what this participant brings and where they will clash with the others.
- "expectedDisagreement": one sentence naming the deepest expected disagreement.
- ${languageInstruction(input.language)}

## Output
Return ONLY JSON: {"participants": [{"characterId": string, "perspectiveSlug": string, "role": string, "selectionReason": string}], "expectedDisagreement": string}`;

    const state = applicationState({
      mode: input.mode,
      participantsToChoose: input.count,
      neededPerspectives: input.perspectives,
      shortlist: input.shortlist,
    });
    return {
      version: versionId(ID, VERSION),
      system,
      messages: [
        {
          role: 'user',
          content: `${state}\n\nTopic (derived from user input):\n${untrusted('topic', `${input.topicTitle}\n\n${input.topicSummary}`)}`,
        },
      ],
    };
  },
};
