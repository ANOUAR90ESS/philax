import type { VoiceGateway, VoiceOutcome } from '../gateways';
import { visemeAt, wordAtChar, type SubtitleSegment, type Viseme } from '../lipsync/visemes';
import type { SpeechHandlers } from '../providers/types';
import type { PresentationPlan } from './presentation';

export type StageAudio = 'voice' | 'muted' | 'text-only';
export type StageVoiceIssue =
  Extract<VoiceOutcome, { status: 'unavailable' }>['reason'] | 'no_profile' | null;

export interface StageSnapshot {
  plan: PresentationPlan | null;
  segmentIndex: number;
  wordIndex: number;
  viseme: Viseme;
  audio: StageAudio;
  voiceIssue: StageVoiceIssue;
  queued: number;
}

/** Plays a finished audio clip (remote voices); injected by the browser layer. */
export type ClipPlayer = (url: string, handlers: SpeechHandlers) => { cancel(): void };

export interface StagePlayerOptions {
  muted?: boolean;
  tickMs?: number;
  playClip?: ClipPlayer;
  now?: () => number;
}

const IDLE: StageSnapshot = {
  plan: null,
  segmentIndex: 0,
  wordIndex: 0,
  viseme: 'rest',
  audio: 'text-only',
  voiceIssue: null,
  queued: 0,
};

/**
 * Presents debate turns one at a time: voice first, with the avatar's mouth
 * following the voice's word boundaries and subtitles following the words.
 * Without a usable voice the turn still plays as timed subtitles.
 */
export class StagePlayer {
  private snapshot: StageSnapshot = IDLE;
  private readonly listeners = new Set<() => void>();
  private readonly queue: PresentationPlan[] = [];
  private muted: boolean;
  private generation = 0;
  private running = false;
  private wordStartedAt = 0;
  private speaking = false;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private interrupt: (() => void) | null = null;
  private readonly now: () => number;

  constructor(
    private readonly voices: VoiceGateway,
    private readonly opts: StagePlayerOptions = {},
  ) {
    this.muted = opts.muted ?? false;
    this.now = opts.now ?? (() => Date.now());
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): StageSnapshot => this.snapshot;

  isMuted(): boolean {
    return this.muted;
  }

  enqueue(plan: PresentationPlan): void {
    if (this.snapshot.plan?.messageId === plan.messageId) return;
    if (this.queue.some((p) => p.messageId === plan.messageId)) return;
    this.queue.push(plan);
    this.update({ queued: this.queue.length });
    void this.drain();
  }

  /** Interrupts whatever is playing and presents this turn now. */
  playNow(plan: PresentationPlan): void {
    this.queue.length = 0;
    this.queue.push(plan);
    this.cancelCurrent();
    void this.drain();
  }

  skip(): void {
    this.cancelCurrent();
  }

  stop(): void {
    this.queue.length = 0;
    this.cancelCurrent();
  }

  /** Takes effect from the next sentence; the current one is cut short when muting. */
  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) this.interrupt?.();
    this.update({ audio: muted ? 'muted' : this.snapshot.audio });
  }

  dispose(): void {
    this.stop();
    this.listeners.clear();
  }

  private cancelCurrent(): void {
    this.generation++;
    this.interrupt?.();
  }

  private update(patch: Partial<StageSnapshot>): void {
    const next = { ...this.snapshot, ...patch };
    const keys = Object.keys(patch) as (keyof StageSnapshot)[];
    if (keys.every((k) => next[k] === this.snapshot[k])) return;
    this.snapshot = next;
    for (const l of this.listeners) l();
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      let plan: PresentationPlan | undefined;
      while ((plan = this.queue.shift())) {
        const generation = ++this.generation;
        this.update({
          plan,
          queued: this.queue.length,
          segmentIndex: 0,
          wordIndex: 0,
          voiceIssue: null,
        });
        this.startTicker();
        for (const segment of plan.segments) {
          if (generation !== this.generation) break;
          await this.playSegment(generation, plan, segment);
        }
      }
    } finally {
      this.stopTicker();
      this.running = false;
      this.update({ ...IDLE, audio: this.muted ? 'muted' : 'text-only' });
    }
  }

  /** Waits `ms`, or less if the current turn is interrupted. */
  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(done, ms);
      const previous = this.interrupt;
      function done() {
        clearTimeout(timer);
        resolve();
      }
      this.interrupt = () => {
        previous?.();
        done();
      };
    });
  }

  private async playSegment(
    generation: number,
    plan: PresentationPlan,
    segment: SubtitleSegment,
  ): Promise<void> {
    this.interrupt = null;
    this.wordStartedAt = this.now();
    this.update({ segmentIndex: segment.index, wordIndex: 0 });
    const pause =
      plan.media.status === 'ready' ? plan.media.profile.voice.rendering.sentencePauseMs : 350;

    let spoken: Promise<void> | null = null;
    if (this.muted) this.update({ audio: 'muted' });
    else if (plan.media.status !== 'ready')
      this.update({ audio: 'text-only', voiceIssue: 'no_profile' });
    else {
      const outcome = await this.voices.synthesize(plan.media, segment.text, plan.language);
      if (generation !== this.generation) return;
      if (outcome.status === 'unavailable')
        this.update({ audio: 'text-only', voiceIssue: outcome.reason });
      else {
        this.update({ audio: 'voice', voiceIssue: null });
        this.wordStartedAt = this.now();
        spoken = this.speak(outcome.audio, segment);
      }
    }
    this.speaking = true;
    await (spoken ?? this.wait(segment.estimatedMs));
    this.speaking = false;
    if (generation !== this.generation) return;
    this.update({ wordIndex: segment.words.length - 1, viseme: 'rest' });
    await this.wait(pause);
  }

  private speak(
    audio: Extract<VoiceOutcome, { status: 'ready' }>['audio'],
    segment: SubtitleSegment,
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(safety);
        resolve();
      };
      // Some voices never report an end; do not let the stage hang on them.
      const safety = setTimeout(finish, segment.estimatedMs * 2.5 + 3000);
      const handlers: SpeechHandlers = {
        onBoundary: (charIndex) => {
          this.wordStartedAt = this.now();
          this.update({ wordIndex: wordAtChar(segment, charIndex) });
        },
        onEnd: finish,
        onError: () => {
          this.update({ audio: 'text-only', voiceIssue: 'provider_error' });
          finish();
        },
      };
      let handle: { cancel(): void } | null = null;
      if (audio.kind === 'stream') {
        audio.playback.start(handlers);
        handle = audio.playback;
      } else if (this.opts.playClip) handle = this.opts.playClip(audio.url, handlers);
      else setTimeout(finish, audio.durationMs);
      this.interrupt = () => {
        handle?.cancel();
        finish();
      };
    });
  }

  private startTicker(): void {
    if (this.ticker) return;
    this.ticker = setInterval(() => this.tick(), this.opts.tickMs ?? 50);
  }

  private stopTicker(): void {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
  }

  /** Advances the estimated word clock between voice boundaries and updates the mouth. */
  private tick(): void {
    const { plan, segmentIndex } = this.snapshot;
    const segment = plan?.segments[segmentIndex];
    if (!segment || !this.speaking) return;
    let { wordIndex } = this.snapshot;
    let elapsed = this.now() - this.wordStartedAt;
    let word = segment.words[wordIndex];
    while (word && elapsed >= word.durationMs && wordIndex < segment.words.length - 1) {
      elapsed -= word.durationMs;
      this.wordStartedAt += word.durationMs;
      word = segment.words[++wordIndex];
    }
    this.update({ wordIndex, viseme: visemeAt(word, elapsed) });
  }
}
