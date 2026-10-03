import type { DebateService } from '@philax/debates';
import {
  CreateChallengeRequestSchema,
  CreateDebateRequestSchema,
  SaveDebateRequestSchema,
  UserMessageRequestSchema,
} from '@philax/types';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { streamSse } from '../http/sse';
import { parseOrThrow } from '../http/validation';
import { currentUser } from '../plugins/auth';

const IdParams = z.object({ id: z.uuid() });
const EventBody = z.object({ event: z.literal('source_opened') });

export class DebatesController {
  constructor(private readonly debates: DebateService) {}

  create = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = parseOrThrow(CreateDebateRequestSchema, request.body);
    const debate = await this.debates.create(currentUser(request), body);
    return reply.status(201).send({ debate });
  };

  createChallenge = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = parseOrThrow(CreateChallengeRequestSchema, request.body);
    const debate = await this.debates.createChallenge(currentUser(request), body);
    return reply.status(201).send({ debate });
  };

  list = async (request: FastifyRequest) => ({
    debates: await this.debates.list(currentUser(request)),
  });

  get = async (request: FastifyRequest) => {
    const { id } = parseOrThrow(IdParams, request.params);
    return { debate: await this.debates.view(currentUser(request), id) };
  };

  advance = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = parseOrThrow(IdParams, request.params);
    const user = currentUser(request);
    await this.debates.assertCanAdvance(user, id);
    await streamSse(request, reply, (emit, signal) => this.debates.advance(user, id, emit, signal));
  };

  postMessage = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = parseOrThrow(IdParams, request.params);
    const { content } = parseOrThrow(UserMessageRequestSchema, request.body);
    const user = currentUser(request);
    await this.debates.assertCanPostMessage(user, id);
    await streamSse(request, reply, (emit, signal) =>
      this.debates.postUserMessage(user, id, content, emit, signal),
    );
  };

  save = async (request: FastifyRequest) => {
    const { id } = parseOrThrow(IdParams, request.params);
    const { saved } = parseOrThrow(SaveDebateRequestSchema, request.body);
    await this.debates.setSaved(currentUser(request), id, saved);
    return { saved };
  };

  remove = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = parseOrThrow(IdParams, request.params);
    await this.debates.delete(currentUser(request), id);
    return reply.status(204).send();
  };

  event = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = parseOrThrow(IdParams, request.params);
    parseOrThrow(EventBody, request.body);
    const user = currentUser(request);
    await this.debates.view(user, id); // ownership check
    this.debates.trackSourceOpened(user);
    return reply.status(204).send();
  };
}
