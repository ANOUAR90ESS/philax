import type { CharacterRepository } from '@philax/characters';
import { AppError } from '@philax/types';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { parseOrThrow } from '../http/validation';

/** Public, read-only access to curated character knowledge (transparency of sources). */
export class CharactersController {
  constructor(private readonly characters: CharacterRepository) {}

  get = async (request: FastifyRequest) => {
    const { id } = parseOrThrow(z.object({ id: z.uuid() }), request.params);
    const character = await this.characters.getFull(id);
    if (!character) throw new AppError('NOT_FOUND', 'Character not found.');
    return { character };
  };
}
