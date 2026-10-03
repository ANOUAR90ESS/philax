import type { PromptTemplate } from '../framework';
import { buildTurnPrompt, type TurnPromptInput } from './turn-common';

const ID = 'debate-response';
const VERSION = 1;

export const responsePrompt: PromptTemplate<TurnPromptInput> = {
  id: ID,
  version: VERSION,
  build: (input) =>
    buildTurnPrompt(
      ID,
      VERSION,
      input,
      'Engage the challenge in the message to answer. Begin with what the objection gets right (if anything), then defend or refine your view. A response that ignores the objection is invalid.',
    ),
};
