import type { DebateService } from '@philax/debates';
import type { CharacterMediaService, MediaCharacter, TurnInput } from '@philax/media-service';
import {
  AppError,
  AvatarSessionRequestSchema,
  SpeechRequestSchema,
  type AvatarSessionResponse,
  type AvatarSpeakEvent,
  type DebateView,
  type SpeechRequest,
  type UserView,
} from '@philax/types';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { streamSse } from '../http/sse';
import { parseOrThrow } from '../http/validation';
import { currentUser } from '../plugins/auth';

const DebateParams = z.object({ id: z.uuid() });
const SessionParams = z.object({ id: z.string().min(1).max(200) });
const JobParams = z.object({ id: z.string().regex(/^[a-f0-9]{64}$/) });

function participant(debate: DebateView, characterId: string): MediaCharacter {
  const p = debate.participants.find((x) => x.character.id === characterId);
  if (!p) throw new AppError('NOT_FOUND', 'This character is not in the debate.');
  return { id: p.character.id, slug: p.character.slug };
}

/**
 * Character media endpoints. The spoken text always comes from the stored
 * debate turn after an ownership check, never from the client, so the
 * endpoints cannot be used to voice arbitrary text.
 */
export class MediaController {
  constructor(
    private readonly media: CharacterMediaService,
    private readonly debates: DebateService,
  ) {}

  private async turn(
    user: UserView,
    req: z.output<typeof SpeechRequestSchema>,
  ): Promise<TurnInput> {
    const debate = await this.debates.view(user, req.debateId);
    const message = debate.messages.find((m) => m.id === req.messageId);
    if (!message) throw new AppError('NOT_FOUND', 'This turn was not found.');
    if (message.speaker.type !== 'character')
      throw new AppError('VALIDATION_FAILED', 'Only character turns are voiced.');
    return {
      character: participant(debate, message.speaker.characterId),
      content: message.content,
      language: debate.language,
      speed: req.speed,
      fromSegment: req.fromSegment,
    };
  }

  status = async () => ({ status: this.media.status() });

  cast = async (request: FastifyRequest) => {
    const { id } = parseOrThrow(DebateParams, request.params);
    const debate = await this.debates.view(currentUser(request), id);
    const characters = debate.participants.map((p) => ({
      id: p.character.id,
      slug: p.character.slug,
    }));
    return {
      status: this.media.status(),
      cast: await this.media.cast(characters, debate.language),
    };
  };

  speech = async (request: FastifyRequest) => {
    const body = parseOrThrow(SpeechRequestSchema, request.body);
    const turn = await this.turn(currentUser(request), body);
    return { speech: await this.media.speech(turn) };
  };

  openSession = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = parseOrThrow(AvatarSessionRequestSchema, request.body);
    const user = currentUser(request);
    const debate = await this.debates.view(user, body.debateId);
    const character = participant(debate, body.characterId);
    const session = await this.media.openSession(user.id, character, debate.language);
    if (!session.viewer) throw new AppError('INTERNAL', 'The avatar session has no viewer.');
    const res: AvatarSessionResponse = {
      sessionId: session.sessionId,
      characterId: character.id,
      livekitUrl: session.viewer.livekitUrl,
      livekitToken: session.viewer.livekitToken,
      maxDurationSeconds: session.maxDurationSeconds,
    };
    return reply.status(201).send({ session: res });
  };

  speak = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = parseOrThrow(SessionParams, request.params);
    const body = parseOrThrow(SpeechRequestSchema, request.body);
    const user = currentUser(request);
    const turn = await this.turn(user, body);
    await streamSse<AvatarSpeakEvent>(request, reply, (emit, signal) =>
      this.media.speakInSession(user.id, id, turn, emit, signal),
    );
  };

  interrupt = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = parseOrThrow(SessionParams, request.params);
    this.media.interrupt(currentUser(request).id, id);
    return reply.status(204).send();
  };

  closeSession = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = parseOrThrow(SessionParams, request.params);
    await this.media.closeSession(currentUser(request).id, id);
    return reply.status(204).send();
  };

  renderSegment = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = parseOrThrow(SpeechRequestSchema, request.body);
    const user = currentUser(request);
    const turn = await this.turn(user, body);
    return reply.status(202).send({ video: await this.media.renderSegment(user.id, turn) });
  };

  segmentStatus = async (request: FastifyRequest) => {
    const { id } = parseOrThrow(JobParams, request.params);
    return { video: await this.media.segmentStatus(currentUser(request).id, id) };
  };
}

export type { SpeechRequest };
