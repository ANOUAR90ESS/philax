import { randomUUID } from 'node:crypto';
import {
  CharacterStyleRegistry,
  speakableText,
  subtitleSegments,
  validateConfigReuse,
  validateMediaConfig,
  type CharacterIdentity,
  type CharacterMediaConfig,
  type CharacterStyle,
  type IdentityIssue,
} from '@philax/media';
import {
  AppError,
  type AvatarMode,
  type CharacterMediaView,
  type MediaAvailability,
  type MediaStatus,
  type MediaUnavailableDetails,
  type MediaUnavailableReason,
  type VideoSegmentResponse,
  type VoiceSpeed,
} from '@philax/types';
import { MediaCache, cacheKey } from './cache';
import { isMediaProviderError, type MediaFailure } from './errors';
import type {
  AssetFacts,
  AudioFormat,
  AvatarEvent,
  AvatarProvider,
  AvatarSession,
  VoiceProvider,
  VoiceResult,
  VoiceSettings,
} from './ports';
import { toMediaConfig, type MediaProfileRepository, type MediaProfileRow } from './repository';

const AVATAR_PROVIDERS = ['heygen', 'joggai'] as const;
const VOICE_PROVIDERS = ['elevenlabs'] as const;

/** Delivery for characters without a brief in the style catalog. */
const DEFAULT_VOICE_SETTINGS: VoiceSettings = { speed: 1, stability: 0.5, style: 0.3 };

const SPEED_FACTOR: Record<VoiceSpeed, number> = { slow: 0.85, normal: 1, fast: 1.15 };

/** A character as the media service addresses it. */
export interface MediaCharacter {
  /** Database id. */
  id: string;
  slug: string;
}

export interface TurnInput {
  character: MediaCharacter;
  /** The turn's text as stored by the debate engine. */
  content: string;
  /** BCP-47 tag of the debate; its primary subtag is sent to the voice provider. */
  language: string;
  speed: VoiceSpeed;
  fromSegment: number;
}

export interface CharacterMediaServiceOptions {
  repository: MediaProfileRepository;
  voice: VoiceProvider;
  /** Null when avatars are switched off for the deployment. */
  avatar: AvatarProvider | null;
  styles?: CharacterStyleRegistry;
  voiceModel: string;
  /** Open real-time sessions allowed on this server. */
  maxLiveSessions?: number;
  /** Real-time sessions close after this long without speech. */
  idleSessionMs?: number;
  audioCacheBytes?: number;
  now?: () => number;
}

interface Resolved {
  view: CharacterMediaView;
  config: CharacterMediaConfig | null;
  voiceId: string | null;
  avatarId: string | null;
  speed: number;
  stability: number;
  style: number;
}

interface OpenSession {
  userId: string;
  characterId: string;
  session: AvatarSession;
  idle: ReturnType<typeof setTimeout> | null;
  speaking: AbortController | null;
}

interface VideoJob {
  videoId: string;
  owners: Set<string>;
  status: VideoSegmentResponse;
}

const FACT_TTL_MS = 10 * 60_000;

function failureReason(code: MediaFailure): MediaUnavailableReason {
  return code === 'not_configured'
    ? 'provider_not_configured'
    : code === 'identity_mismatch'
      ? 'identity_mismatch'
      : code;
}

function issueReason(issue: IdentityIssue): MediaUnavailableReason {
  switch (issue.code) {
    case 'avatar_not_configured':
    case 'voice_not_configured':
      return 'not_configured';
    case 'invalid_provider':
      return 'invalid_provider';
    default:
      return 'identity_mismatch';
  }
}

const AVATAR_ISSUES = new Set(['avatar_not_configured', 'avatar_presentation_mismatch']);
const VOICE_ISSUES = new Set(['voice_not_configured', 'voice_presentation_mismatch']);

function issueSide(issue: IdentityIssue): 'avatar' | 'voice' | 'both' {
  if (AVATAR_ISSUES.has(issue.code)) return 'avatar';
  if (VOICE_ISSUES.has(issue.code)) return 'voice';
  if (issue.code === 'invalid_provider')
    return issue.detail.includes('avatar') ? 'avatar' : 'voice';
  if (issue.code === 'identity_reuse') return issue.detail.startsWith('Voice') ? 'voice' : 'avatar';
  return 'both';
}

const ready: MediaAvailability = { status: 'ready' };
const unavailable = (reason: MediaUnavailableReason): MediaAvailability => ({
  status: 'unavailable',
  reason,
});

export function mediaUnavailable(
  kind: 'voice' | 'avatar',
  reason: MediaUnavailableReason,
  retryAfterMs: number | null = null,
  cause?: unknown,
): AppError {
  const what = kind === 'voice' ? 'Voice' : 'Avatar';
  // User-facing: never names a provider or its setup.
  const message =
    reason === 'provider_not_configured' ||
    reason === 'not_configured' ||
    reason === 'identity_mismatch'
      ? `${what} unavailable for this character.`
      : `${what} unavailable right now. Please retry.`;
  const details: MediaUnavailableDetails = { kind, reason, retryAfterMs };
  return new AppError('MEDIA_UNAVAILABLE', message, { details, cause });
}

/**
 * Character Media Service: between the debate (which supplies a turn) and the
 * avatar/voice gateways. It resolves a character's configured assets, checks
 * them against the character's identity, and only then calls a provider. When
 * anything is missing or mismatched the answer is "unavailable" — never another
 * character's voice or face, and never a generic default.
 */
export class CharacterMediaService {
  readonly styles: CharacterStyleRegistry;
  private readonly audio: MediaCache<VoiceResult>;
  private readonly facts = new Map<string, { facts: AssetFacts | null; expires: number }>();
  private readonly sessions = new Map<string, OpenSession>();
  private readonly videos = new Map<string, VideoJob>();
  private readonly maxLiveSessions: number;
  private readonly idleSessionMs: number;
  private readonly now: () => number;

  constructor(private readonly opts: CharacterMediaServiceOptions) {
    this.styles = opts.styles ?? new CharacterStyleRegistry();
    this.maxLiveSessions = opts.maxLiveSessions ?? 4;
    this.idleSessionMs = opts.idleSessionMs ?? 90_000;
    this.now = opts.now ?? Date.now;
    this.audio = new MediaCache<VoiceResult>({
      maxBytes: opts.audioCacheBytes ?? 64 * 1024 * 1024,
      ttlMs: 24 * 60 * 60_000,
      sizeOf: (v) => v.audio.byteLength,
      now: this.now,
    });
  }

  get avatarMode(): AvatarMode {
    return this.opts.avatar?.kind ?? 'off';
  }

  status(): MediaStatus {
    return {
      voice: { provider: 'elevenlabs', configured: this.opts.voice.configured },
      avatar: {
        mode: this.avatarMode,
        configured: this.opts.avatar?.configured ?? false,
        presentation: this.opts.avatar?.transparent ? 'cutout' : 'framed',
      },
    };
  }

  /**
   * The identity a character's media is checked against: its brief in the
   * style catalog, or — for characters added later without one — the
   * presentation recorded in its media profile. Never inferred from a name.
   */
  briefFor(
    slug: string,
    row: MediaProfileRow | null,
  ):
    | {
        status: 'ready';
        identity: CharacterIdentity;
        settings: VoiceSettings;
        style: CharacterStyle | null;
      }
    | { status: 'unavailable'; reason: MediaUnavailableReason } {
    const brief = this.styles.resolve(slug);
    if (brief.status === 'ready')
      return {
        status: 'ready',
        identity: brief.identity,
        settings: brief.style.voiceSettings,
        style: brief.style,
      };
    if (brief.reason === 'invalid_profile')
      return { status: 'unavailable', reason: 'identity_mismatch' };
    if (!row || row.presentation === 'unknown')
      return { status: 'unavailable', reason: 'not_configured' };
    return {
      status: 'ready',
      identity: {
        characterSlug: slug,
        presentation: row.presentation,
        presentationBasis: 'Recorded in the character media profile.',
        likeness: 'conjectural',
      },
      settings: DEFAULT_VOICE_SETTINGS,
      style: null,
    };
  }

  private async assetFacts(
    key: string,
    lookup: () => Promise<AssetFacts | null>,
  ): Promise<AssetFacts | null> {
    const cached = this.facts.get(key);
    if (cached && cached.expires > this.now()) return cached.facts;
    const facts = await lookup();
    this.facts.set(key, { facts, expires: this.now() + FACT_TTL_MS });
    return facts;
  }

  /**
   * Resolves what can be shown and heard for one character in one language.
   * Provider metadata (e.g. an ElevenLabs voice's gender label) is checked
   * against the character when the provider reports it.
   */
  async resolve(character: MediaCharacter, language: string): Promise<Resolved> {
    const lang = language.split('-')[0]?.toLowerCase() ?? language;
    const row = await this.opts.repository.get(character.id);
    const brief = this.briefFor(character.slug, row);
    const base = {
      config: null,
      voiceId: null,
      avatarId: null,
      speed: 1,
      stability: 0.5,
      style: 0,
    };
    if (brief.status !== 'ready')
      return {
        ...base,
        view: {
          characterId: character.id,
          voice: unavailable(brief.reason),
          avatar: unavailable(brief.reason),
        },
      };

    const config = row ? toMediaConfig(row) : null;
    const settings = brief.settings;
    let voice: MediaAvailability = ready;
    let avatar: MediaAvailability = ready;
    const voiceId = config ? (config.voice.languageVoices[lang] ?? config.voice.voiceId) : null;
    const avatarProvider = this.opts.avatar;
    // A rendered-video avatar belongs to one provider: another provider's id is not used.
    const avatarId = !config
      ? null
      : avatarProvider?.kind === 'live'
        ? config.avatar.liveAvatarId
        : config.avatar.provider === avatarProvider?.name
          ? config.avatar.avatarId
          : null;

    if (!config) {
      voice = unavailable('not_configured');
      avatar = unavailable('not_configured');
    } else {
      const all = (await this.opts.repository.list()).map(toMediaConfig);
      const issues = [
        ...validateMediaConfig(brief.identity, config, {
          avatarProviders: AVATAR_PROVIDERS,
          voiceProviders: VOICE_PROVIDERS,
        }),
        ...validateConfigReuse(all).filter((i) => i.characterId === config.characterId),
      ];
      for (const issue of issues) {
        const side = issueSide(issue);
        const reason = issueReason(issue);
        // A mismatch outranks "not configured" on the same side.
        if (side !== 'avatar' && (voice.status === 'ready' || reason === 'identity_mismatch'))
          voice = unavailable(reason);
        if (side !== 'voice' && (avatar.status === 'ready' || reason === 'identity_mismatch'))
          avatar = unavailable(reason);
      }
      if (voice.status === 'ready' && !voiceId) voice = unavailable('not_configured');
      if (avatar.status === 'ready' && !avatarId) avatar = unavailable('not_configured');
    }

    if (voice.status === 'ready' && !this.opts.voice.configured)
      voice = unavailable('provider_not_configured');
    if (avatar.status === 'ready' && !avatarProvider?.configured)
      avatar = unavailable('provider_not_configured');

    // Provider-reported facts: an asset the provider lists with another gender is refused.
    if (voice.status === 'ready' && voiceId && config) {
      voice = await this.checkFacts(
        `voice:${voiceId}`,
        () => this.opts.voice.describeVoice(voiceId),
        (facts) =>
          validateMediaConfig(brief.identity, config, {
            avatarProviders: AVATAR_PROVIDERS,
            voiceProviders: VOICE_PROVIDERS,
            facts: { voiceGender: facts.gender },
          }).some((i) => i.code === 'voice_presentation_mismatch'),
      );
    }
    if (avatar.status === 'ready' && avatarId && avatarProvider && config) {
      avatar = await this.checkFacts(
        `avatar:${avatarProvider.name}:${avatarId}`,
        () => avatarProvider.describeAvatar(avatarId),
        (facts) =>
          validateMediaConfig(brief.identity, config, {
            avatarProviders: AVATAR_PROVIDERS,
            voiceProviders: VOICE_PROVIDERS,
            facts: { avatarGender: facts.gender },
          }).some((i) => i.code === 'avatar_presentation_mismatch'),
      );
    }

    return {
      view: { characterId: character.id, voice, avatar },
      config,
      voiceId,
      avatarId,
      speed: settings.speed,
      stability: settings.stability,
      style: settings.style,
    };
  }

  private async checkFacts(
    key: string,
    lookup: () => Promise<AssetFacts | null>,
    mismatched: (facts: AssetFacts) => boolean,
  ): Promise<MediaAvailability> {
    try {
      const facts = await this.assetFacts(key, lookup);
      return facts && mismatched(facts) ? unavailable('identity_mismatch') : ready;
    } catch (err) {
      if (!isMediaProviderError(err)) throw err;
      // A transient lookup failure does not block an asset whose declared identity already matched.
      if (err.retryable) return ready;
      return unavailable(failureReason(err.code));
    }
  }

  async cast(characters: readonly MediaCharacter[], language: string) {
    return Promise.all(characters.map(async (c) => (await this.resolve(c, language)).view));
  }

  /** The text to voice for a turn, from a subtitle segment onward. */
  static spokenText(content: string, fromSegment: number): string {
    const text = speakableText(content);
    if (fromSegment <= 0) return text;
    return subtitleSegments(text)
      .slice(fromSegment)
      .map((s) => s.text)
      .join(' ');
  }

  private async voiceTurn(
    resolved: Resolved,
    turn: TurnInput,
    format: AudioFormat,
    signal?: AbortSignal,
  ): Promise<{ text: string; result: VoiceResult }> {
    if (resolved.view.voice.status !== 'ready' || !resolved.voiceId)
      throw mediaUnavailable(
        'voice',
        resolved.view.voice.status === 'unavailable'
          ? resolved.view.voice.reason
          : 'not_configured',
      );
    const text = CharacterMediaService.spokenText(turn.content, turn.fromSegment);
    if (!text) throw new AppError('VALIDATION_FAILED', 'Nothing left to say in this turn.');
    const language = turn.language.split('-')[0]?.toLowerCase() ?? turn.language;
    const speed = Math.min(1.2, Math.max(0.7, resolved.speed * SPEED_FACTOR[turn.speed]));
    const key = cacheKey([
      turn.character.id,
      resolved.voiceId,
      language,
      this.opts.voiceModel,
      speed,
      resolved.stability,
      resolved.style,
      format,
      text,
    ]);
    const cached = this.audio.get(key);
    if (cached) return { text, result: cached };
    try {
      const result = await this.opts.voice.synthesize({
        voiceId: resolved.voiceId,
        text,
        language,
        format,
        settings: { speed, stability: resolved.stability, style: resolved.style },
        signal,
      });
      this.audio.set(key, result);
      return { text, result };
    } catch (err) {
      if (isMediaProviderError(err))
        throw mediaUnavailable('voice', failureReason(err.code), err.retryAfterMs, err);
      throw err;
    }
  }

  /** Audio-first playback: the character's voice for a turn, with timing for subtitles. */
  async speech(turn: TurnInput, signal?: AbortSignal) {
    const resolved = await this.resolve(turn.character, turn.language);
    const { text, result } = await this.voiceTurn(resolved, turn, 'mp3_44100_128', signal);
    return {
      text,
      audio: Buffer.from(result.audio).toString('base64'),
      mimeType: result.mimeType,
      alignment: result.alignment,
      durationMs: result.durationMs,
    };
  }

  private requireAvatar(resolved: Resolved, kind: 'live' | 'video'): AvatarProvider {
    const provider = this.opts.avatar;
    if (!provider || provider.kind !== kind)
      throw mediaUnavailable('avatar', 'provider_not_configured');
    if (resolved.view.avatar.status !== 'ready' || !resolved.avatarId)
      throw mediaUnavailable(
        'avatar',
        resolved.view.avatar.status === 'unavailable'
          ? resolved.view.avatar.reason
          : 'not_configured',
      );
    return provider;
  }

  /**
   * Opens a real-time avatar session for a character. A user has at most one
   * open session (opening another closes the previous one), and sessions close
   * themselves when idle, so cost follows actual speaking time.
   */
  async openSession(userId: string, character: MediaCharacter, language: string) {
    const resolved = await this.resolve(character, language);
    const provider = this.requireAvatar(resolved, 'live');
    const avatarId = resolved.avatarId ?? '';
    for (const [id, s] of this.sessions)
      if (s.userId === userId) await this.closeSession(userId, id);
    if (this.sessions.size >= this.maxLiveSessions) throw mediaUnavailable('avatar', 'busy');
    let session: AvatarSession;
    try {
      session = await provider.createSession({ characterId: character.id, avatarId });
    } catch (err) {
      if (isMediaProviderError(err))
        throw mediaUnavailable('avatar', failureReason(err.code), err.retryAfterMs, err);
      throw err;
    }
    const open: OpenSession = {
      userId,
      characterId: character.id,
      session,
      idle: null,
      speaking: null,
    };
    this.sessions.set(session.sessionId, open);
    this.armIdle(session.sessionId, open);
    return session;
  }

  private armIdle(sessionId: string, open: OpenSession): void {
    if (open.idle) clearTimeout(open.idle);
    open.idle = setTimeout(() => {
      void this.closeSession(open.userId, sessionId).catch(() => undefined);
    }, this.idleSessionMs);
    open.idle.unref?.();
  }

  private ownedSession(userId: string, sessionId: string): OpenSession {
    const open = this.sessions.get(sessionId);
    if (!open || open.userId !== userId)
      throw new AppError('NOT_FOUND', 'This avatar session has ended.');
    return open;
  }

  /**
   * Voices a turn through ElevenLabs and has the session's avatar speak it.
   * Events: the alignment first (for subtitles), then started/ended as the
   * provider reports them, so captions start with the avatar's mouth.
   */
  async speakInSession(
    userId: string,
    sessionId: string,
    turn: TurnInput,
    emit: (
      e:
        | {
            type: 'alignment';
            text: string;
            alignment: VoiceResult['alignment'];
            durationMs: number;
          }
        | AvatarEvent,
    ) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const open = this.ownedSession(userId, sessionId);
    if (open.characterId !== turn.character.id)
      throw new AppError('VALIDATION_FAILED', 'This session belongs to another character.');
    const resolved = await this.resolve(turn.character, turn.language);
    const provider = this.requireAvatar(resolved, 'live');
    if (open.idle) clearTimeout(open.idle);
    open.speaking?.abort();
    const speaking = new AbortController();
    open.speaking = speaking;
    const stop = signal ? AbortSignal.any([signal, speaking.signal]) : speaking.signal;
    try {
      const { text, result } = await this.voiceTurn(resolved, turn, provider.audioFormat, stop);
      emit({ type: 'alignment', text, alignment: result.alignment, durationMs: result.durationMs });
      await provider.speak({
        sessionId,
        audio: result,
        eventId: randomUUID(),
        onEvent: emit,
        signal: stop,
      });
    } catch (err) {
      if (isMediaProviderError(err))
        throw mediaUnavailable('avatar', failureReason(err.code), err.retryAfterMs, err);
      throw err;
    } finally {
      if (open.speaking === speaking) open.speaking = null;
      if (this.sessions.has(sessionId)) this.armIdle(sessionId, open);
    }
  }

  /** Stops the current utterance (pause/skip). */
  interrupt(userId: string, sessionId: string): void {
    const open = this.ownedSession(userId, sessionId);
    open.speaking?.abort();
    this.opts.avatar?.interrupt?.(sessionId);
  }

  async closeSession(userId: string, sessionId: string): Promise<void> {
    const open = this.sessions.get(sessionId);
    if (!open || open.userId !== userId) return;
    this.sessions.delete(sessionId);
    if (open.idle) clearTimeout(open.idle);
    open.speaking?.abort();
    await this.opts.avatar?.stopSession(sessionId);
  }

  /**
   * Renders a turn as a lip-synced avatar video segment (HeyGen) from the
   * character's ElevenLabs audio. Each turn renders once; later requests share it.
   */
  async renderSegment(userId: string, turn: TurnInput): Promise<VideoSegmentResponse> {
    const resolved = await this.resolve(turn.character, turn.language);
    const provider = this.requireAvatar(resolved, 'video');
    const { text, result } = await this.voiceTurn(resolved, turn, provider.audioFormat);
    const jobId = cacheKey([turn.character.id, resolved.avatarId ?? '', result.durationMs, text]);
    const existing = this.videos.get(jobId);
    if (existing && existing.status.status !== 'failed') {
      existing.owners.add(userId);
      return existing.status;
    }
    try {
      const session = await provider.createSession({
        characterId: turn.character.id,
        avatarId: resolved.avatarId ?? '',
      });
      const spoken = await provider.speak({
        sessionId: session.sessionId,
        audio: result,
        eventId: jobId,
      });
      await provider.stopSession(session.sessionId);
      if (spoken.kind !== 'video') throw new AppError('INTERNAL', 'Unexpected avatar result.');
      const status: VideoSegmentResponse = { jobId, status: 'pending', videoUrl: null };
      this.videos.set(jobId, { videoId: spoken.videoId, owners: new Set([userId]), status });
      return status;
    } catch (err) {
      if (isMediaProviderError(err))
        throw mediaUnavailable('avatar', failureReason(err.code), err.retryAfterMs, err);
      throw err;
    }
  }

  async segmentStatus(userId: string, jobId: string): Promise<VideoSegmentResponse> {
    const job = this.videos.get(jobId);
    const provider = this.opts.avatar;
    if (!job || !job.owners.has(userId) || !provider?.videoStatus)
      throw new AppError('NOT_FOUND', 'This video is not available.');
    if (job.status.status === 'completed' || job.status.status === 'failed') return job.status;
    try {
      const s = await provider.videoStatus(job.videoId);
      job.status =
        s.status === 'completed'
          ? { jobId, status: 'completed', videoUrl: s.videoUrl }
          : { jobId, status: s.status, videoUrl: null };
      return job.status;
    } catch (err) {
      if (isMediaProviderError(err))
        throw mediaUnavailable('avatar', failureReason(err.code), err.retryAfterMs, err);
      throw err;
    }
  }

  async close(): Promise<void> {
    await Promise.allSettled(
      [...this.sessions.entries()].map(([id, s]) => this.closeSession(s.userId, id)),
    );
  }
}

export type { MediaProfileRow };
