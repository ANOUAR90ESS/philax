import type { PromptTemplate } from '../framework';
import { buildTurnPrompt, type TurnPromptInput } from './turn-common';

const ID = 'debate-opening';
const VERSION = 1;

export const openingPrompt: PromptTemplate<TurnPromptInput> = {
  id: ID,
  version: VERSION,
  build: (input) =>
    buildTurnPrompt(
      ID,
      VERSION,
      input,
      'Set out the position clearly so others can attack it: one central claim, its key premises and the assumption it rests on. Do not respond to others yet.',
    ),
};
