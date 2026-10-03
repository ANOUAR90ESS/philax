import type { PromptTemplate } from '../framework';
import { buildTurnPrompt, type TurnPromptInput } from './turn-common';

const ID = 'debate-challenge';
const VERSION = 1;

export const challengePrompt: PromptTemplate<TurnPromptInput> = {
  id: ID,
  version: VERSION,
  build: (input) =>
    buildTurnPrompt(
      ID,
      VERSION,
      input,
      'Address the target directly. Press the planned strongest objection; aim at a premise, assumption, definition or reading of evidence. Do not caricature the target or merely restate your own opening.',
    ),
};
