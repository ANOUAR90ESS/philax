import type { PromptTemplate } from '../framework';
import { buildTurnPrompt, type TurnPromptInput } from './turn-common';

const ID = 'debate-open-question';
const VERSION = 1;

export const openQuestionPrompt: PromptTemplate<TurnPromptInput> = {
  id: ID,
  version: VERSION,
  build: (input) =>
    buildTurnPrompt(
      ID,
      VERSION,
      input,
      'Be brief and honest about uncertainty. State what remains unresolved for your perspective and what evidence or argument could change your mind.',
    ),
};
