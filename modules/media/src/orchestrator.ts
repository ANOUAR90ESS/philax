import { ageProfileFor, type CharacterStyle, type Presentation } from '@philax/media';
import { AppError, type MediaUnavailableReason } from '@philax/types';
import { isMediaProviderError, MediaProviderError } from './errors';
import type { AvatarGateway, VoiceGateway } from './gateways';
import type { MediaProfileRepository, MediaProfileRow, MediaSide } from './repository';
import type { CharacterMediaService } from './service';

/** A selected debate participant, as the debate engine describes it. */
export interface PreparableCharacter {
  id: string;
  slug: string;
  displayName: string;
  era: string;
  birthYear: number | null;
  deathYear: number | null;
}

export interface PrepareParticipantsInput {
  debateId: string;
  /** BCP-47 tag of the debate. */
  language: string;
  characters: readonly PreparableCharacter[];
}

/** Internal preparation states (logged; never shown to users). */
export const MEDIA_PREPARATION_STATES = [
  'MEDIA_PREPARATION_STARTED',
  'AVATAR_RESOLVING',
  'VOICE_RESOLVING',
  'MEDIA_VALIDATING',
  'MEDIA_READY',
  'MEDIA_FAILED',
] as const;
export type MediaPreparationState = (typeof MEDIA_PREPARATION_STATES)[number];

export type SideOutcome =
  | { status: 'ready'; prepared: boolean }
  /** Not available for this character, and nothing more can be done now (e.g. no provider). */
  | { status: 'unavailable'; reason: MediaUnavailableReason }
  /** Preparation was attempted and failed. */
  | { status: 'failed'; reason: MediaUnavailableReason };

export interface ParticipantOutcome {
  characterId: string;
  avatar: SideOutcome;
  voice: SideOutcome;
}

export interface MediaOrchestratorOptions {
  repository: MediaProfileRepository;
  media: CharacterMediaService;
  voices: VoiceGateway;
  avatars: AvatarGateway;
  /** Characters prepared at once (provider rate limits). */
  concurrency?: number;
  /** How long to wait for a preparation another request already started. */
  waitForOtherMs?: number;
  pollMs?: number;
  sleep?: (ms: number) => Promise<void>;
  onState?: (characterId: string, state: MediaPreparationState, detail?: string) => void;
}

/** Reasons that only mean "this side is not set up" (presented without it; not a failure). */
const SETUP_REASONS = new Set<MediaUnavailableReason>([
  'provider_not_configured',
  'not_configured',
  'identity_mismatch',
  'invalid_provider',
  'invalid_voice',
  'invalid_avatar',
]);

function normalizeGender(g: string | null): Presentation | null {
  const v = g?.trim().toLowerCase();
  if (v === 'male' || v === 'man') return 'male';
  if (v === 'female' || v === 'woman') return 'female';
  return null;
}

function failureReason(err: unknown): MediaUnavailableReason {
  if (!isMediaProviderError(err)) return 'unavailable';
  if (err.code === 'not_configured') return 'provider_not_configured';
  return err.code;
}

/** Runs `fn` over `items` with at most `limit` in flight. */
async function mapLimited<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}

/**
 * Media Orchestrator: after the debate engine selects its participants, makes
 * sure each one can be seen and heard as itself before the debate starts.
 *
 * For every character it reuses a valid existing media profile, and only when
 * a side is missing does it prepare one through the avatar/voice gateway
 * (once per character, ever — the profile is saved and reused by later
 * debates). Every asset is validated against the character's identity; a
 * failure is never covered with another character's avatar or voice.
 */
export class MediaOrchestrator {
  private readonly inFlight = new Map<string, Promise<SideOutcome>>();
  private readonly concurrency: number;
  private readonly waitForOtherMs: number;
  private readonly pollMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly o: MediaOrchestratorOptions) {
    this.concurrency = o.concurrency ?? 2;
    this.waitForOtherMs = o.waitForOtherMs ?? 6 * 60_000;
    this.pollMs = o.pollMs ?? 2000;
    this.sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  private state(characterId: string, state: MediaPreparationState, detail?: string) {
    this.o.onState?.(characterId, state, detail);
  }

  /**
   * Prepares every participant. Resolves when all are ready (or have nothing
   * that can be prepared, e.g. no provider configured); throws
   * PARTICIPANTS_NOT_READY when a preparation failed, so the debate does not
   * start with a participant half-prepared.
   */
  async prepareParticipants(
    input: PrepareParticipantsInput,
    signal?: AbortSignal,
  ): Promise<ParticipantOutcome[]> {
    const outcomes = await mapLimited(input.characters, this.concurrency, (c) =>
      this.prepareCharacter(c, input.language, signal),
    );
    const failed = outcomes.find(
      (o) => o.avatar.status === 'failed' || o.voice.status === 'failed',
    );
    if (failed) {
      const side = failed.voice.status === 'failed' ? failed.voice : failed.avatar;
      throw new AppError(
        'PARTICIPANTS_NOT_READY',
        "We couldn't prepare one of the participants. Please try again.",
        {
          details: {
            characterId: failed.characterId,
            reason: side.status === 'failed' ? side.reason : 'unavailable',
          },
        },
      );
    }
    return outcomes;
  }

  private async prepareCharacter(
    character: PreparableCharacter,
    language: string,
    signal?: AbortSignal,
  ): Promise<ParticipantOutcome> {
    this.state(character.id, 'MEDIA_PREPARATION_STARTED');
    const style = this.o.media.styles.resolve(character.slug);
    const brief = style.status === 'ready' ? style.style : null;
    const row = await this.o.repository.ensure(character.id, {
      presentation: brief?.visualIdentity.presentation ?? 'unknown',
      ageProfile: brief?.voiceIdentity.ageProfile ?? this.ageProfile(character),
      visualNotes: brief
        ? [brief.visualIdentity.era, brief.visualIdentity.appearanceReference]
            .filter(Boolean)
            .join(' — ')
        : character.era,
    });
    const identity = this.o.media.briefFor(character.slug, row);

    let view = (await this.o.media.resolve(character, language)).view;
    this.state(character.id, 'VOICE_RESOLVING');
    let voice: SideOutcome =
      view.voice.status === 'ready'
        ? { status: 'ready', prepared: false }
        : { status: 'unavailable', reason: view.voice.reason };
    this.state(character.id, 'AVATAR_RESOLVING');
    let avatar: SideOutcome =
      view.avatar.status === 'ready'
        ? { status: 'ready', prepared: false }
        : { status: 'unavailable', reason: view.avatar.reason };

    // Only a side that is simply missing, for a character with a known identity, is prepared.
    const canPrepare = identity.status === 'ready' && row !== null;
    const tasks: Promise<void>[] = [];
    if (
      canPrepare &&
      view.voice.status === 'unavailable' &&
      view.voice.reason === 'not_configured' &&
      !row.voiceId &&
      this.o.voices.canPrepare
    )
      tasks.push(
        this.once(character, 'voice', () =>
          this.prepareVoice(character, row, identity.identity.presentation, brief),
        ).then((r) => {
          voice = r;
        }),
      );
    if (
      canPrepare &&
      view.avatar.status === 'unavailable' &&
      view.avatar.reason === 'not_configured' &&
      this.o.media.avatarMode === 'video' &&
      // None yet, or only one made by another video provider.
      (!row.avatarId || row.avatarProvider !== this.o.avatars.provider) &&
      this.o.avatars.canPrepare &&
      this.o.avatars.supports?.(identity.identity.presentation) !== false
    )
      tasks.push(
        this.once(character, 'avatar', () =>
          this.prepareAvatar(character, row, identity.identity.presentation, brief),
        ).then((r) => {
          avatar = r;
        }),
      );
    await Promise.all(tasks);
    if (signal?.aborted) throw new AppError('INVALID_STATE', 'Preparation was cancelled.');

    if (tasks.length) {
      // Everything prepared is validated again exactly as playback will see it.
      this.state(character.id, 'MEDIA_VALIDATING');
      view = (await this.o.media.resolve(character, language)).view;
      if (voice.status === 'ready' && view.voice.status !== 'ready')
        voice = { status: 'failed', reason: view.voice.reason };
      if (avatar.status === 'ready' && view.avatar.status !== 'ready')
        avatar = { status: 'failed', reason: view.avatar.reason };
    }

    const ready = voice.status === 'ready' && avatar.status === 'ready';
    const failed = voice.status === 'failed' || avatar.status === 'failed';
    await this.o.repository.setStatus(
      character.id,
      ready ? 'ready' : failed ? 'failed' : 'not_ready',
    );
    this.state(
      character.id,
      failed ? 'MEDIA_FAILED' : 'MEDIA_READY',
      `voice=${voice.status} avatar=${avatar.status}`,
    );
    // A side that is merely not set up is not a failure: the participant is presented without it.
    if (voice.status === 'unavailable' && !SETUP_REASONS.has(voice.reason))
      voice = { status: 'failed', reason: voice.reason };
    if (avatar.status === 'unavailable' && !SETUP_REASONS.has(avatar.reason))
      avatar = { status: 'failed', reason: avatar.reason };
    return { characterId: character.id, voice, avatar };
  }

  /** One preparation per character and side at a time in this process. */
  private once(
    character: PreparableCharacter,
    side: MediaSide,
    run: () => Promise<SideOutcome>,
  ): Promise<SideOutcome> {
    const key = `${character.id}:${side}`;
    const existing = this.inFlight.get(key);
    if (existing) return existing;
    const p = run().finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, p);
    return p;
  }

  /**
   * Claims the side in the database (so concurrent servers do not prepare the
   * same character twice), prepares it with one retry for transient provider
   * failures, checks the result against the character, and saves it.
   */
  private async provision(
    character: PreparableCharacter,
    side: MediaSide,
    presentation: Presentation,
    prepare: () => Promise<{
      assign: Parameters<MediaProfileRepository['assign']>[1];
      gender: string | null;
    }>,
  ): Promise<SideOutcome> {
    if (!(await this.o.repository.claim(character.id, side, this.o.avatars.provider)))
      return this.waitForOther(character, side);
    try {
      let result;
      try {
        result = await prepare();
      } catch (err) {
        if (!(isMediaProviderError(err) && err.retryable)) throw err;
        await this.sleep(err.retryAfterMs ?? 2000);
        result = await prepare();
      }
      const gender = normalizeGender(result.gender);
      if (gender && gender !== presentation)
        throw new MediaProviderError(
          side === 'voice' ? 'elevenlabs' : this.o.avatars.provider,
          'identity_mismatch',
          `prepared ${side} is ${gender}; character is ${presentation}`,
        );
      await this.o.repository.assign(character.slug, result.assign);
      return { status: 'ready', prepared: true };
    } catch (err) {
      await this.o.repository.fail(character.id, side);
      this.state(character.id, 'MEDIA_FAILED', `${side}: ${failureReason(err)}`);
      return { status: 'failed', reason: failureReason(err) };
    }
  }

  /** Another request is preparing this side: wait for its result instead of preparing twice. */
  private async waitForOther(
    character: PreparableCharacter,
    side: MediaSide,
  ): Promise<SideOutcome> {
    for (let waited = 0; waited < this.waitForOtherMs; waited += this.pollMs) {
      await this.sleep(this.pollMs);
      const row = await this.o.repository.get(character.id);
      const status = side === 'voice' ? row?.voiceStatus : row?.avatarStatus;
      if (status === 'ready') return { status: 'ready', prepared: false };
      if (status !== 'pending') return { status: 'failed', reason: 'generation_failed' };
    }
    return { status: 'failed', reason: 'timeout' };
  }

  private prepareVoice(
    character: PreparableCharacter,
    row: MediaProfileRow,
    presentation: Presentation,
    brief: CharacterStyle | null,
  ): Promise<SideOutcome> {
    return this.provision(character, 'voice', presentation, async () => {
      const prepared = await this.o.voices.prepareCharacterVoice({
        characterSlug: character.slug,
        name: `Philax · ${character.slug}`,
        description: this.voiceDescription(character, row, presentation, brief),
        presentation,
      });
      return {
        assign: { voiceId: prepared.voiceId, voicePresentation: presentation },
        gender: prepared.gender,
      };
    });
  }

  private prepareAvatar(
    character: PreparableCharacter,
    row: MediaProfileRow,
    presentation: Presentation,
    brief: CharacterStyle | null,
  ): Promise<SideOutcome> {
    return this.provision(character, 'avatar', presentation, async () => {
      const prepared = await this.o.avatars.prepareCharacterAvatar({
        characterSlug: character.slug,
        name: `Philax · ${character.slug}`,
        description: this.avatarDescription(character, row, presentation, brief),
        presentation,
        approximateAge: this.approximateAge(character, brief),
      });
      return {
        assign: {
          [prepared.slot]: prepared.avatarId,
          ...(prepared.slot === 'avatarId' ? { avatarProvider: this.o.avatars.provider } : {}),
          avatarPresentation: presentation,
        },
        gender: prepared.gender,
      };
    });
  }

  private ageProfile(c: PreparableCharacter): string | null {
    if (c.birthYear === null || c.deathYear === null) return null;
    return ageProfileFor(Math.min(c.deathYear - c.birthYear, 70));
  }

  private approximateAge(c: PreparableCharacter, brief: CharacterStyle | null): number | null {
    if (brief?.visualIdentity.approximateAge) return brief.visualIdentity.approximateAge;
    if (c.birthYear === null || c.deathYear === null) return null;
    return Math.min(c.deathYear - c.birthYear, 65);
  }

  private voiceDescription(
    c: PreparableCharacter,
    row: MediaProfileRow,
    presentation: Presentation,
    brief: CharacterStyle | null,
  ): string {
    const age = brief?.voiceIdentity.ageProfile ?? row.ageProfile ?? 'mature';
    const v = brief?.voiceIdentity;
    const delivery = v
      ? `${v.tone}; ${v.pace} pace. ${v.speechStyle}`
      : 'thoughtful and articulate, with a measured pace suited to intellectual debate.';
    return (
      `A ${age} ${presentation} speaker, ${delivery} ` +
      'Clear, natural studio recording. An original voice, not an imitation of any real person.'
    ).slice(0, 1000);
  }

  private avatarDescription(
    c: PreparableCharacter,
    row: MediaProfileRow,
    presentation: Presentation,
    brief: CharacterStyle | null,
  ): string {
    const age = this.approximateAge(c, brief);
    const era = brief?.visualIdentity.era ?? c.era;
    const likeness = brief?.visualIdentity.appearanceReference ?? row.visualNotes;
    return (
      `Photorealistic head-and-shoulders portrait of a ${presentation} thinker` +
      `${age ? ` around ${age} years old` : ''}, ${era}. ${likeness} ` +
      'Period-appropriate clothing and grooming, neutral studio background, facing the camera, ' +
      'calm attentive expression. A respectful AI reconstruction for an educational debate.'
    ).slice(0, 1000);
  }
}
