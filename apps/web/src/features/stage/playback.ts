import {
  captionAt,
  speakableText,
  stageStates,
  subtitleSegments,
  type AvatarState,
  type SubtitleSegment,
} from '@philax/media';
import type {
  CharacterMediaView,
  DebateMessage,
  DebateParticipant,
  ErrorCode,
  MediaStatus,
  MediaUnavailableDetails,
  MediaUnavailableReason,
  VoiceSpeed,
} from '@philax/types';
import { ApiClientError } from '../../api/client';
import type { MediaApi } from '../../api/media';

/** The media element surface playback uses (an HTMLAudioElement in the browser). */
export type MediaElementLike = Pick<
  HTMLMediaElement,
  'src' | 'muted' | 'currentTime' | 'play' | 'pause' | 'onended' | 'onerror'
>;

export interface LiveViewer {
  connect(url: string, token: string, video: HTMLVideoElement): Promise<void>;
  setMuted(muted: boolean): void;
  disconnect(): Promise<void>;
}

export interface StagePrefs {
  muted: boolean;
  captions: boolean;
  avatar: boolean;
  speed: VoiceSpeed;
}

export const DEFAULT_PREFS: StagePrefs = {
  muted: false,
  captions: true,
  avatar: true,
  speed: 'normal',
};

/** How a turn is being presented. */
export type PlaybackMode = 'live' | 'video' | 'audio' | 'text';

export interface MediaIssue {
  kind: 'voice' | 'avatar';
  reason: MediaUnavailableReason;
}

export interface CurrentTurn {
  messageId: string;
  characterId: string;
  move: DebateMessage['move'];
  addressedCharacterIds: string[];
  mode: PlaybackMode;
  phase: 'loading' | 'playing' | 'paused';
  /** Captions for the text being spoken (from `segmentOffset` of the turn on). */
  segments: SubtitleSegment[];
  segmentOffset: number;
  positionMs: number;
  /** Why the turn is presented with less than was asked for (e.g. avatar unavailable). */
  notices: MediaIssue[];
  /** A failure the user can retry. */
  error: MediaIssue | null;
  videoUrl: string | null;
}

export interface StageSnapshot {
  status: MediaStatus | null;
  cast: ReadonlyMap<string, CharacterMediaView>;
  current: CurrentTurn | null;
  queued: number;
  prefs: StagePrefs;
  /** Whether a turn has been presented (and can be replayed). */
  canReplay: boolean;
}

export interface PlaybackDeps {
  api: MediaApi;
  createAudio: () => MediaElementLike;
  createViewer: () => Promise<LiveViewer>;
  /** Called with the new prefs after each change (persistence). */
  savePrefs?: (prefs: StagePrefs) => void;
  tickMs?: number;
}

interface Turn {
  debateId: string;
  message: DebateMessage;
}

interface LiveSession {
  characterId: string;
  sessionId: string;
  viewer: LiveViewer;
}

function isMediaDetails(d: unknown): d is MediaUnavailableDetails {
  return typeof d === 'object' && d !== null && 'kind' in d && 'reason' in d;
}

function issueFrom(err: unknown, kind: 'voice' | 'avatar'): MediaIssue {
  if (err instanceof ApiClientError) {
    if (isMediaDetails(err.details)) return { kind: err.details.kind, reason: err.details.reason };
    if (err.code === 'RATE_LIMITED') return { kind, reason: 'rate_limited' };
  }
  return { kind, reason: 'unavailable' };
}

const isAbort = (err: unknown) => (err as { name?: string } | null)?.name === 'AbortError';

/** Pause after a turn before the next one. */
const GAP_MS = 400;
const TEXT_RATE: Record<VoiceSpeed, number> = { slow: 0.85, normal: 1, fast: 1.15 };

/**
 * Presents debate turns on the stage. Each turn is played in the richest form
 * the user allows and the character's configured media supports: a real-time
 * lip-synced avatar, a rendered avatar segment, the character's voice, or text
 * captions. Nothing is ever voiced or shown with another character's identity;
 * an unavailable avatar or voice is reported, not replaced.
 */
export class StagePlayback {
  private snapshot: StageSnapshot;
  private readonly listeners = new Set<() => void>();
  private readonly queue: Turn[] = [];
  private turn: Turn | null = null;
  private last: Turn | null = null;
  private abort: AbortController | null = null;
  private element: MediaElementLike | null = null;
  private video: HTMLVideoElement | null = null;
  private live: LiveSession | null = null;
  private clock = { base: 0, startedAt: 0, running: false };
  private ticker: ReturnType<typeof setInterval> | null = null;
  private next: ReturnType<typeof setTimeout> | null = null;
  private readonly videos = new Map<string, string>();
  private readonly tickMs: number;
  private disposed = false;

  constructor(
    private readonly deps: PlaybackDeps,
    prefs: StagePrefs = DEFAULT_PREFS,
  ) {
    this.tickMs = deps.tickMs ?? 100;
    this.snapshot = {
      status: null,
      cast: new Map(),
      current: null,
      queued: 0,
      prefs,
      canReplay: false,
    };
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  private set(patch: Partial<StageSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch, queued: this.queue.length };
    for (const l of this.listeners) l();
  }

  private patchCurrent(patch: Partial<CurrentTurn>) {
    const current = this.snapshot.current;
    if (current) this.set({ current: { ...current, ...patch } });
  }

  setMedia(status: MediaStatus | null, cast: CharacterMediaView[]) {
    this.set({ status, cast: new Map(cast.map((c) => [c.characterId, c])) });
  }

  /** The `<video>` element real-time and rendered avatars play in. */
  attachVideo = (el: HTMLVideoElement | null) => {
    this.video = el;
  };

  // ---- queue -------------------------------------------------------------

  enqueue(debateId: string, message: DebateMessage) {
    if (message.speaker.type !== 'character') return;
    this.queue.push({ debateId, message });
    if (!this.turn) this.advance();
    else this.set({});
  }

  playNow(debateId: string, message: DebateMessage) {
    if (message.speaker.type !== 'character') return;
    this.queue.length = 0;
    this.stopTurn();
    this.start({ debateId, message }, 0);
  }

  skip() {
    this.stopTurn();
    this.advance();
  }

  /** Plays the current (or last) turn again from the start. */
  replay() {
    const turn = this.turn ?? this.last;
    if (!turn) return;
    this.queue.length = 0;
    this.stopTurn();
    this.start(turn, 0);
  }

  retry() {
    const turn = this.turn;
    if (!turn) return;
    const from = this.resumeSegment();
    this.stopTurn();
    this.start(turn, from);
  }

  private advance() {
    if (this.next) clearTimeout(this.next);
    this.next = null;
    const turn = this.queue.shift();
    if (!turn) {
      this.turn = null;
      this.set({ current: null });
      return;
    }
    this.start(turn, 0);
  }

  private finish() {
    this.stopClock();
    this.element = null;
    this.next = setTimeout(() => this.advance(), GAP_MS);
  }

  // ---- controls ------------------------------------------------------------

  setPrefs(patch: Partial<StagePrefs>) {
    const prefs = { ...this.snapshot.prefs, ...patch };
    this.set({ prefs });
    this.deps.savePrefs?.(prefs);
    if (patch.muted !== undefined) {
      if (this.element) this.element.muted = prefs.muted;
      if (this.video) this.video.muted = prefs.muted;
      this.live?.viewer.setMuted(prefs.muted);
    }
    if (patch.avatar === false) void this.closeLive();
  }

  pause() {
    const current = this.snapshot.current;
    if (!current || current.phase !== 'playing') return;
    this.stopClock();
    if (current.mode === 'live' && this.live) {
      // Real-time speech cannot be held mid-word: stop it and resume from this caption.
      const from = this.resumeSegment();
      this.abort?.abort();
      void this.deps.api.interrupt(this.live.sessionId).catch(() => undefined);
      this.patchCurrent({ phase: 'paused', segmentOffset: from, segments: [], positionMs: 0 });
      return;
    }
    if (current.mode === 'video') this.video?.pause();
    else this.element?.pause();
    this.patchCurrent({ phase: 'paused' });
  }

  resume() {
    const current = this.snapshot.current;
    const turn = this.turn;
    if (!current || current.phase !== 'paused' || !turn) return;
    if (current.mode === 'live') {
      this.start(turn, current.segmentOffset);
      return;
    }
    if (current.mode === 'text') {
      this.startClock(this.clock.base);
      this.patchCurrent({ phase: 'playing' });
      return;
    }
    const el = current.mode === 'video' ? this.video : this.element;
    void el?.play().catch(() => undefined);
    this.startClock(0);
    this.patchCurrent({ phase: 'playing' });
  }

  private resumeSegment(): number {
    const c = this.snapshot.current;
    if (!c) return 0;
    const at = captionAt(c.segments, c.positionMs);
    return c.segmentOffset + (at?.segment ?? 0);
  }

  // ---- playback ------------------------------------------------------------

  private plan(characterId: string): { mode: PlaybackMode; notices: MediaIssue[] } {
    const { prefs, status, cast } = this.snapshot;
    const view = cast.get(characterId);
    const voice = view?.voice ?? { status: 'unavailable', reason: 'not_configured' };
    const avatar = view?.avatar ?? { status: 'unavailable', reason: 'not_configured' };
    const notices: MediaIssue[] = [];
    if (prefs.avatar && avatar.status === 'unavailable')
      notices.push({ kind: 'avatar', reason: avatar.reason });
    if (voice.status === 'unavailable' && (!prefs.muted || prefs.avatar))
      notices.push({ kind: 'voice', reason: voice.reason });
    const avatarMode = status?.avatar.mode ?? 'off';
    // A provider avatar always speaks with the character's own voice, so it needs both.
    if (prefs.avatar && avatar.status === 'ready' && voice.status === 'ready') {
      if (avatarMode === 'live') return { mode: 'live', notices };
      if (avatarMode === 'video') return { mode: 'video', notices };
    }
    if (!prefs.muted && voice.status === 'ready') return { mode: 'audio', notices };
    return { mode: 'text', notices };
  }

  private start(turn: Turn, fromSegment: number) {
    if (this.disposed) return;
    if (this.next) clearTimeout(this.next);
    this.next = null;
    this.turn = turn;
    this.last = turn;
    const { message } = turn;
    if (message.speaker.type !== 'character') return;
    const characterId = message.speaker.characterId;
    const { mode, notices } = this.plan(characterId);
    const abort = new AbortController();
    this.abort = abort;
    this.set({
      canReplay: true,
      current: {
        messageId: message.id,
        characterId,
        move: message.move,
        addressedCharacterIds: message.addressedCharacterIds,
        mode,
        phase: 'loading',
        segments: [],
        segmentOffset: fromSegment,
        positionMs: 0,
        notices,
        error: null,
        videoUrl: null,
      },
    });
    const run =
      mode === 'live'
        ? this.playLive(turn, characterId, fromSegment, abort.signal)
        : mode === 'video'
          ? this.playVideo(turn, fromSegment, abort.signal)
          : mode === 'audio'
            ? this.playAudio(turn, fromSegment, abort.signal)
            : Promise.resolve(this.playText(turn, fromSegment));
    void run.catch((err: unknown) => {
      if (abort.signal.aborted || isAbort(err)) return;
      this.fail(turn, issueFrom(err, mode === 'live' || mode === 'video' ? 'avatar' : 'voice'));
    });
  }

  /** A failed turn stays readable: captions continue as text, with a Retry. */
  private fail(turn: Turn, error: MediaIssue) {
    if (this.turn !== turn) return;
    const from = this.snapshot.current?.segmentOffset ?? 0;
    this.stopClock();
    this.element = null;
    this.playText(turn, from);
    this.patchCurrent({ error, mode: 'text' });
  }

  private textFor(message: DebateMessage, fromSegment: number): string {
    const text = speakableText(message.content);
    if (!fromSegment) return text;
    return subtitleSegments(text)
      .slice(fromSegment)
      .map((s) => s.text)
      .join(' ');
  }

  private playText(turn: Turn, fromSegment: number) {
    const segments = subtitleSegments(
      this.textFor(turn.message, fromSegment),
      undefined,
      TEXT_RATE[this.snapshot.prefs.speed],
    );
    this.patchCurrent({ phase: 'playing', segments, segmentOffset: fromSegment, positionMs: 0 });
    this.startClock(0);
  }

  private async playAudio(turn: Turn, fromSegment: number, signal: AbortSignal) {
    const { speech } = await this.deps.api.speech(
      {
        debateId: turn.debateId,
        messageId: turn.message.id,
        speed: this.snapshot.prefs.speed,
        fromSegment,
      },
      signal,
    );
    if (signal.aborted) return;
    const el = this.deps.createAudio();
    this.element = el;
    el.muted = this.snapshot.prefs.muted;
    el.onended = () => {
      if (this.element === el) this.finish();
    };
    el.onerror = () => {
      if (this.element === el) this.fail(turn, { kind: 'voice', reason: 'unavailable' });
    };
    el.src = `data:${speech.mimeType};base64,${speech.audio}`;
    this.patchCurrent({
      segments: subtitleSegments(speech.text, speech.alignment ?? undefined),
      segmentOffset: fromSegment,
    });
    await el.play();
    if (signal.aborted) return;
    this.patchCurrent({ phase: 'playing' });
    this.startClock(0);
  }

  private async playVideo(turn: Turn, fromSegment: number, signal: AbortSignal) {
    const key = `${turn.message.id}:${this.snapshot.prefs.speed}`;
    const ready = fromSegment === 0 ? this.videos.get(key) : undefined;
    const video = this.video;
    if (!ready || !video) {
      // Rendering takes a while: voice now (audio first), and keep the segment for replay.
      if (fromSegment === 0) void this.renderSegment(turn, key);
      if (!this.snapshot.prefs.muted) return this.playAudio(turn, fromSegment, signal);
      this.patchCurrent({ mode: 'text' });
      return this.playText(turn, fromSegment);
    }
    const { speech } = await this.deps.api.speech(
      { debateId: turn.debateId, messageId: turn.message.id, speed: this.snapshot.prefs.speed },
      signal,
    );
    if (signal.aborted) return;
    video.muted = this.snapshot.prefs.muted;
    video.src = ready;
    video.onended = () => this.finish();
    this.patchCurrent({
      videoUrl: ready,
      segments: subtitleSegments(speech.text, speech.alignment ?? undefined),
    });
    await video.play();
    this.patchCurrent({ phase: 'playing' });
    this.startClock(0);
  }

  private async renderSegment(turn: Turn, key: string) {
    try {
      const body = {
        debateId: turn.debateId,
        messageId: turn.message.id,
        speed: this.snapshot.prefs.speed,
      };
      let { video } = await this.deps.api.renderVideo(body);
      for (let i = 0; i < 120 && !this.disposed; i++) {
        if (video.status === 'completed' && video.videoUrl) {
          this.videos.set(key, video.videoUrl);
          return;
        }
        if (video.status === 'failed') return;
        await new Promise((r) => setTimeout(r, 5000));
        ({ video } = await this.deps.api.videoStatus(video.jobId));
      }
    } catch {
      // The turn was voiced already; the segment simply is not available for replay.
    }
  }

  private async ensureLive(debateId: string, characterId: string): Promise<LiveSession> {
    if (this.live?.characterId === characterId) return this.live;
    await this.closeLive();
    const video = this.video;
    if (!video) throw new Error('no video surface');
    const { session } = await this.deps.api.openSession({ debateId, characterId });
    const viewer = await this.deps.createViewer();
    try {
      await viewer.connect(session.livekitUrl, session.livekitToken, video);
    } catch (err) {
      void this.deps.api.closeSession(session.sessionId).catch(() => undefined);
      throw err;
    }
    viewer.setMuted(this.snapshot.prefs.muted);
    this.live = { characterId, sessionId: session.sessionId, viewer };
    return this.live;
  }

  private async closeLive() {
    const live = this.live;
    this.live = null;
    if (!live) return;
    await live.viewer.disconnect().catch(() => undefined);
    await this.deps.api.closeSession(live.sessionId).catch(() => undefined);
  }

  private async playLive(
    turn: Turn,
    characterId: string,
    fromSegment: number,
    signal: AbortSignal,
  ) {
    const live = await this.ensureLive(turn.debateId, characterId);
    if (signal.aborted) return;
    let ended = false;
    await this.deps.api.speak(
      live.sessionId,
      {
        debateId: turn.debateId,
        messageId: turn.message.id,
        speed: this.snapshot.prefs.speed,
        fromSegment,
      },
      (e) => {
        if (signal.aborted) return;
        switch (e.type) {
          case 'alignment':
            this.patchCurrent({ segments: subtitleSegments(e.text, e.alignment ?? undefined) });
            return;
          case 'speak_started':
            // Captions start with the avatar's mouth, not with the request.
            this.patchCurrent({ phase: 'playing' });
            this.startClock(0);
            return;
          case 'speak_ended':
          case 'speak_interrupted':
            ended = true;
            this.finish();
            return;
          case 'error':
            throw new ApiClientError(e.code as ErrorCode, e.message, 503, e.errorId, e.details);
        }
      },
      signal,
    );
    if (!ended && !signal.aborted) this.finish();
  }

  // ---- clock ---------------------------------------------------------------

  private now(): number {
    return performance.now();
  }

  private startClock(base: number) {
    this.clock = { base, startedAt: this.now(), running: true };
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = setInterval(() => this.tick(), this.tickMs);
  }

  private stopClock() {
    if (this.clock.running) this.clock.base = this.position();
    this.clock.running = false;
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
  }

  private position(): number {
    const current = this.snapshot.current;
    if (current?.mode === 'audio' && this.element) return this.element.currentTime * 1000;
    if (current?.mode === 'video' && this.video) return this.video.currentTime * 1000;
    return this.clock.running
      ? this.clock.base + this.now() - this.clock.startedAt
      : this.clock.base;
  }

  private tick() {
    const current = this.snapshot.current;
    if (!current || current.phase !== 'playing') return;
    const positionMs = this.position();
    this.patchCurrent({ positionMs });
    if (current.mode === 'text') {
      const end = current.segments.at(-1)?.endMs ?? 0;
      if (positionMs >= end + GAP_MS) this.finish();
    }
  }

  private stopTurn() {
    this.abort?.abort();
    this.abort = null;
    this.stopClock();
    if (this.next) clearTimeout(this.next);
    this.next = null;
    if (this.element) {
      this.element.onended = null;
      this.element.onerror = null;
      this.element.pause();
      this.element = null;
    }
    const current = this.snapshot.current;
    if (current?.mode === 'video') this.video?.pause();
    if (current?.mode === 'live' && current.phase === 'playing' && this.live)
      void this.deps.api.interrupt(this.live.sessionId).catch(() => undefined);
  }

  /** Avatar states of the cast at this moment (speaker in focus, others listening). */
  states(participants: readonly DebateParticipant[], thinkingCharacterId?: string) {
    const current = this.snapshot.current;
    const ids = participants.map((p) => p.character.id);
    const states: Record<string, AvatarState> = stageStates(
      ids,
      current
        ? {
            speaking: {
              speaker: { type: 'character', characterId: current.characterId },
              move: current.move,
              addressedCharacterIds: current.addressedCharacterIds,
            },
          }
        : { thinkingCharacterId },
    );
    return states;
  }

  dispose() {
    this.disposed = true;
    this.queue.length = 0;
    this.stopTurn();
    void this.closeLive();
  }
}
