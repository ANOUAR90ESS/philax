import {
  TRUST_RULES,
  applicationState,
  languageInstruction,
  untrusted,
  versionId,
  type PromptTemplate,
} from '../framework';

export interface DebatePlannerInput {
  language: string;
  mode: 'debate' | 'challenge';
  topicTitle: string;
  topicSummary: string;
  claims: { id: string; kind: string; text: string }[];
  tensions: { description: string; axis: string; poles: string[] }[];
  expectedDisagreement: string | null;
  participants: {
    characterId: string;
    name: string;
    role: string;
    perspective: string;
    worldview: string;
    keyPositions: string[];
  }[];
}

const ID = 'debate-planner';
const VERSION = 1;

export const debatePlannerPrompt: PromptTemplate<DebatePlannerInput> = {
  id: ID,
  version: VERSION,
  build(input) {
    const system = `You plan a structured, multi-round debate between reconstructions of documented thinkers. You design the lines of disagreement; you do not write the speeches and you never decide who is right.

${TRUST_RULES}

## Planning principles
- Optimize for meaningful disagreement, not agreement. Search for the strongest disagreement, not a winner.
- Each disagreement axis must be grounded in the participants' documented worldviews and positions (application state), typed as assumptions | definitions | values | evidence | priorities | schools.
- Openings: give each participant a distinct angle and, where relevant, claim ids from the topic analysis they should address.
- Challenges: each participant should challenge someone whose position most conflicts with theirs; at least two different participants must be challenged. Reference an axis id.
- Cross-examinations: 1–3 pairs with a pointed focus.
- deepestDisagreement: the axis where the disagreement is most fundamental, phrased as a question.
- openQuestion: the strongest question the debate leaves genuinely open for the audience.
${input.mode === 'challenge' ? "- Challenge mode: the supporter defends the user's idea, the opponent attacks it, the alternative reframes it; make the opponent challenge the supporter." : ''}
- Use only participant ids, claim ids and axis ids that exist. Axis ids are short strings like "x1".
- ${languageInstruction(input.language)}

## Output
Return ONLY JSON: {"disagreementAxes": [{"id": string, "axis": string, "description": string, "between": [characterId, …]}], "openings": [{"characterId": string, "angle": string, "claimIds": [string]}], "challenges": [{"challengerId": string, "targetId": string, "axisId": string}], "crossExaminations": [{"askerId": string, "responderId": string, "focus": string}], "deepestDisagreement": {"axisId": string, "question": string}, "openQuestion": string}`;

    const state = applicationState({
      mode: input.mode,
      participants: input.participants,
      expectedDisagreement: input.expectedDisagreement,
    });
    const topic = untrusted(
      'topic_analysis',
      `${input.topicTitle}\n${input.topicSummary}\n\nClaims:\n${input.claims.map((c) => `${c.id} (${c.kind}): ${c.text}`).join('\n')}\n\nTensions:\n${input.tensions.map((t) => `- [${t.axis}] ${t.description} (${t.poles.join(' / ')})`).join('\n')}`,
    );
    return {
      version: versionId(ID, VERSION),
      system,
      messages: [{ role: 'user', content: `${state}\n\n${topic}` }],
    };
  },
};
