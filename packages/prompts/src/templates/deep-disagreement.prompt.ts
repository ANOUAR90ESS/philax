import type { PromptTemplate } from '../framework';
import { buildTurnPrompt, type TurnPromptInput } from './turn-common';

const ID = 'debate-deep-disagreement';
const VERSION = 1;

export const deepDisagreementPrompt: PromptTemplate<TurnPromptInput> = {
  id: ID,
  version: VERSION,
  build: (input) =>
    buildTurnPrompt(
      ID,
      VERSION,
      input,
      'Go beneath the surface: identify the assumption, definition or value that makes the disagreement persist even when the facts are agreed. Say what the others would have to accept for you to agree, and why you do not.',
    ),
};
