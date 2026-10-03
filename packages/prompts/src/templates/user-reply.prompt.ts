import type { PromptTemplate } from '../framework';
import { buildTurnPrompt, type TurnPromptInput } from './turn-common';

const ID = 'debate-user-reply';
const VERSION = 1;

export const userReplyPrompt: PromptTemplate<TurnPromptInput> = {
  id: ID,
  version: VERSION,
  build: (input) =>
    buildTurnPrompt(
      ID,
      VERSION,
      input,
      'The user has entered the debate (message to answer). Treat the user as a serious interlocutor and a participant, not an authority: do not flatter them, and do not abandon your documented position to agree with them.',
    ),
};
