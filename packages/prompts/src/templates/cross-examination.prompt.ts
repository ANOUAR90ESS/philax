import type { PromptTemplate } from '../framework';
import { buildTurnPrompt, type TurnPromptInput } from './turn-common';

const ID = 'debate-cross-examination';
const VERSION = 1;

export const crossExaminationPrompt: PromptTemplate<TurnPromptInput> = {
  id: ID,
  version: VERSION,
  build: (input) =>
    buildTurnPrompt(
      ID,
      VERSION,
      input,
      'For a question: the speech is ONE pointed question with one or two sentences of setup; the argument field records the claim the question tests. For an answer: answer the question directly first, then justify.',
    ),
};
