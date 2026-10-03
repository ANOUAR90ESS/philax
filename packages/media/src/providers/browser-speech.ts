import type { Presentation } from '../identity/types';
import { BROWSER_VOICE_PROVIDER } from '../profiles/catalog';
import type {
  AudioResult,
  ProviderCapabilities,
  SpeechHandlers,
  SynthesisRequest,
  VoiceProvider,
} from './types';
import { VoiceUnavailableError } from './types';

/** A voice installed on the device (subset of SpeechSynthesisVoice). */
export interface DeviceVoice {
  name: string;
  lang: string;
  voiceURI: string;
}

export interface DeviceUtterance {
  text: string;
  lang: string;
  voice: DeviceVoice;
  pitch: number;
  rate: number;
}

/** Thin seam over `window.speechSynthesis`, injectable for tests. */
export interface SpeechEngine {
  getVoices(): DeviceVoice[];
  speak(utterance: DeviceUtterance, handlers: SpeechHandlers): { cancel(): void };
  /** Resolves once the device voice list has loaded (it loads asynchronously in browsers). */
  ready?(): Promise<void>;
}

/**
 * Device voices whose presentation is documented by their vendor. Voices not
 * listed (and without "male"/"female" in their name) are treated as unknown
 * and never used, so a character cannot end up with a mismatched voice.
 */
const FEMALE_VOICE_NAMES = new Set([
  // Apple
  'samantha',
  'victoria',
  'karen',
  'moira',
  'tessa',
  'fiona',
  'veena',
  'allison',
  'ava',
  'susan',
  'serena',
  'kate',
  'monica',
  'paulina',
  'marisol',
  'angelica',
  'soledad',
  'ximena',
  'laila',
  'mariam',
  'zuzana',
  // Microsoft
  'zira',
  'hazel',
  'catherine',
  'heera',
  'linda',
  'aria',
  'jenny',
  'michelle',
  'sonia',
  'libby',
  'natasha',
  'clara',
  'emma',
  'ana',
  'elvira',
  'helena',
  'laura',
  'sabina',
  'dalia',
  'salome',
  'paloma',
  'elena',
  'hoda',
  'zariyah',
  'salma',
  'amina',
  'mouna',
  'sana',
  'layla',
  'fatima',
  'noura',
  'rana',
  'amany',
  'iman',
  'reem',
  'aysha',
  'yasmin',
]);
const MALE_VOICE_NAMES = new Set([
  // Apple
  'alex',
  'daniel',
  'fred',
  'tom',
  'oliver',
  'arthur',
  'aaron',
  'rishi',
  'gordon',
  'lee',
  'jorge',
  'juan',
  'diego',
  'carlos',
  'maged',
  'majed',
  'tarik',
  // Microsoft
  'david',
  'mark',
  'george',
  'james',
  'ravi',
  'guy',
  'ryan',
  'william',
  'christopher',
  'eric',
  'brian',
  'thomas',
  'pablo',
  'raul',
  'alvaro',
  'gonzalo',
  'hamed',
  'naayf',
  'shakir',
  'bassel',
  'hamdan',
  'omar',
  'fahed',
  'rami',
  'taim',
  'moaz',
  'jamal',
  'ali',
  'abdullah',
  'hedi',
  'ismael',
  'saleh',
  'laith',
  'kareem',
  'tomas',
  'alonso',
  'dario',
  'emilio',
]);
/** Google network voices do not carry a person's name. */
const KNOWN_FULL_NAMES: Record<string, Presentation> = {
  'google us english': 'female',
  'google uk english female': 'female',
  'google uk english male': 'male',
  'google español': 'female',
  'google español de estados unidos': 'female',
};

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Presentation of a device voice, or `unknown` when the vendor does not document it. */
export function classifyDeviceVoice(voice: DeviceVoice): Presentation {
  const full = voice.name.toLowerCase().trim();
  const known = KNOWN_FULL_NAMES[full];
  if (known) return known;
  const tokens = normalize(voice.name)
    .split(/[^a-z]+/)
    .filter(Boolean);
  if (tokens.includes('female')) return 'female';
  if (tokens.includes('male')) return 'male';
  // Microsoft names read "Microsoft <Name> ..."; Apple names are the bare name.
  const candidates = tokens[0] === 'microsoft' ? tokens.slice(1, 2) : tokens.slice(0, 1);
  for (const t of candidates) {
    if (FEMALE_VOICE_NAMES.has(t)) return 'female';
    if (MALE_VOICE_NAMES.has(t)) return 'male';
  }
  return 'unknown';
}

const baseLanguage = (tag: string) => tag.toLowerCase().split(/[-_]/)[0] ?? '';

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Device voices that may speak for a profile in a language, in stable order. */
export function compatibleDeviceVoices(
  voices: DeviceVoice[],
  presentation: Presentation,
  language: string,
): DeviceVoice[] {
  if (presentation === 'unknown' || presentation === 'androgynous') return [];
  const lang = baseLanguage(language);
  return voices
    .filter((v) => baseLanguage(v.lang) === lang && classifyDeviceVoice(v) === presentation)
    .sort((a, b) => a.voiceURI.localeCompare(b.voiceURI));
}

/**
 * Speaks with the voices installed on the device (Web Speech API). Each
 * character's language voice id deterministically picks one compatible device
 * voice and is rendered with the character's own pitch and rate, so two
 * characters sharing a device voice still sound distinct.
 */
export class BrowserSpeechVoiceProvider implements VoiceProvider {
  readonly id = BROWSER_VOICE_PROVIDER;
  readonly capabilities: ProviderCapabilities = {
    delivery: 'realtime',
    typicalLatencyMs: 50,
    costPerMinuteUsd: 0,
    quality: 2,
    requiresNetwork: false,
  };

  constructor(private readonly engine: SpeechEngine | null) {}

  /** Which device voice would speak for this request, if any. */
  pickVoice(req: SynthesisRequest): DeviceVoice | undefined {
    if (!this.engine) return undefined;
    const candidates = compatibleDeviceVoices(
      this.engine.getVoices(),
      req.profile.voiceIdentity.presentation,
      req.language,
    );
    return candidates[hash(req.voiceId) % candidates.length];
  }

  async synthesize(req: SynthesisRequest): Promise<AudioResult> {
    const engine = this.engine;
    if (!engine) throw new VoiceUnavailableError('unsupported', 'Speech synthesis is unavailable.');
    await engine.ready?.();
    const voice = this.pickVoice(req);
    if (!voice)
      throw new VoiceUnavailableError(
        'no_compatible_voice',
        `No ${req.profile.voiceIdentity.presentation} ${req.language} voice is installed.`,
      );
    const { pitch, rate } = req.profile.voice.rendering;
    let active: { cancel(): void } | null = null;
    return {
      kind: 'stream',
      playback: {
        start: (handlers) => {
          active = engine.speak({ text: req.text, lang: voice.lang, voice, pitch, rate }, handlers);
        },
        cancel: () => active?.cancel(),
      },
    };
  }
}

interface SpeechSynthesisLike {
  getVoices(): DeviceVoice[];
  addEventListener?(type: 'voiceschanged', listener: () => void): void;
  speak(u: unknown): void;
  cancel(): void;
}

/** Wraps `window.speechSynthesis`, or returns null where it does not exist. */
export function createWebSpeechEngine(
  win:
    | (typeof globalThis & { speechSynthesis?: unknown; SpeechSynthesisUtterance?: unknown })
    | undefined = globalThis,
): SpeechEngine | null {
  const synth = win?.speechSynthesis as SpeechSynthesisLike | undefined;
  const Utterance = win?.SpeechSynthesisUtterance as
    (new (text: string) => SpeechSynthesisUtterance) | undefined;
  if (!synth || !Utterance) return null;
  let loaded: Promise<void> | null = null;
  return {
    getVoices: () => synth.getVoices(),
    ready() {
      loaded ??= new Promise<void>((resolve) => {
        if (synth.getVoices().length > 0) return resolve();
        synth.addEventListener?.('voiceschanged', () => resolve());
        setTimeout(resolve, 1500);
      });
      return loaded;
    },
    speak(u, handlers) {
      const utterance = new Utterance(u.text);
      utterance.lang = u.lang;
      utterance.voice = u.voice as SpeechSynthesisVoice;
      utterance.pitch = u.pitch;
      utterance.rate = u.rate;
      let cancelled = false;
      utterance.onboundary = (e) => {
        if (e.name === 'word' || e.name === undefined) handlers.onBoundary(e.charIndex);
      };
      utterance.onend = () => {
        if (!cancelled) handlers.onEnd();
      };
      utterance.onerror = (e) => {
        if (!cancelled && e.error !== 'interrupted' && e.error !== 'canceled')
          handlers.onError(new Error(e.error));
      };
      synth.speak(utterance);
      return {
        cancel() {
          cancelled = true;
          synth.cancel();
        },
      };
    },
  };
}
