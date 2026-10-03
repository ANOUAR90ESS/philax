import {
  TRUST_RULES,
  applicationState,
  languageInstruction,
  truncate,
  untrusted,
  versionId,
  type PromptTemplate,
} from '../framework';

export interface ObjectionGeneratorInput {
  language: string;
  challenger: { name: string; perspective: string; worldview: string };
  target: {
    name: string;
    perspective: string;
    speech: string;
    claim: string;
    premises: string[];
    assumptions: string[];
  };
}

const ID = 'objection-generator';
const VERSION = 1;

/** Generates candidate objections; the engine ranks them and selects the strongest (§23). */
export const objectionGeneratorPrompt: PromptTemplate<ObjectionGeneratorInput> = {
  id: ID,
  version: VERSION,
  build(input) {
    const system = `You find objections to an argument in a debate, from the standpoint of a given perspective.

${TRUST_RULES}

## Task
Propose 3–5 distinct objections that ${input.challenger.name} (${input.challenger.perspective}) could raise against ${input.target.name}'s argument, consistent with this worldview: ${input.challenger.worldview}
- Prefer objections that attack a premise, a hidden assumption, a definition or the reading of evidence over objections that merely deny the conclusion.
- No straw men: each objection must engage what the target actually argued.
- Rate each candidate honestly: "relevance" 1–5 (how directly it bears on the argument) and "strength" 1–5 (how hard it is to answer). "targets" is one of premise | assumption | evidence | conclusion | definition.
- ${languageInstruction(input.language)}

## Output
Return ONLY JSON: {"candidates": [{"text": string, "relevance": number, "strength": number, "targets": string}]}`;
    const state = applicationState({
      challenger: input.challenger.name,
      target: input.target.name,
      targetPerspective: input.target.perspective,
    });
    const arg = untrusted(
      'target_argument',
      `Speech: ${truncate(input.target.speech, 2500)}\nClaim: ${input.target.claim}\nPremises: ${input.target.premises.join(' | ')}\nAssumptions: ${input.target.assumptions.join(' | ')}`,
    );
    return {
      version: versionId(ID, VERSION),
      system,
      messages: [{ role: 'user', content: `${state}\n\n${arg}` }],
    };
  },
};
