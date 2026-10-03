import type { CharacterAlignment } from '@philax/media';
import { MediaProviderError } from '../errors';
import type { PreparedVoice, PrepareVoiceInput, VoiceGateway } from '../gateways';
import { callJson, malformed, type FetchLike } from '../http';
import type {
  AssetFacts,
  AudioFormat,
  VoiceProvider,
  VoiceResult,
  VoiceSynthesisInput,
} from '../ports';

export interface ElevenLabsOptions {
  apiKey: string | undefined;
  modelId: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  baseUrl?: string;
}

interface TimestampsResponse {
  audio_base64?: unknown;
  alignment?: CharacterAlignment | null;
}

interface VoiceResponse {
  name?: string;
  labels?: Record<string, string | undefined>;
}

const MIME: Record<AudioFormat, string> = {
  mp3_44100_128: 'audio/mpeg',
  pcm_24000: 'audio/pcm;rate=24000',
};

/**
 * ElevenLabs text-to-speech (POST /v1/text-to-speech/{voice_id}/with-timestamps):
 * returns the audio and per-character timing used for subtitles and sync.
 */
export class ElevenLabsVoiceProvider implements VoiceProvider {
  readonly name = 'elevenlabs' as const;
  private readonly fetch: FetchLike;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;

  constructor(private readonly opts: ElevenLabsOptions) {
    this.fetch = opts.fetch ?? ((url, init) => globalThis.fetch(url, init));
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.baseUrl = opts.baseUrl ?? 'https://api.elevenlabs.io';
  }

  get configured(): boolean {
    return Boolean(this.opts.apiKey);
  }

  private headers(): Record<string, string> {
    if (!this.opts.apiKey)
      throw new MediaProviderError(this.name, 'not_configured', 'ELEVENLABS_API_KEY is not set');
    return { 'xi-api-key': this.opts.apiKey, 'content-type': 'application/json' };
  }

  async synthesize(input: VoiceSynthesisInput): Promise<VoiceResult> {
    const url =
      `${this.baseUrl}/v1/text-to-speech/${encodeURIComponent(input.voiceId)}/with-timestamps` +
      `?output_format=${input.format}`;
    const body = {
      text: input.text,
      model_id: this.opts.modelId,
      // ISO 639-1; models that cannot enforce a language ignore it.
      language_code: input.language,
      voice_settings: {
        stability: input.settings.stability,
        similarity_boost: 0.75,
        style: input.settings.style,
        use_speaker_boost: true,
        speed: Math.min(1.2, Math.max(0.7, input.settings.speed)),
      },
    };
    const res = await callJson<TimestampsResponse>(
      url,
      { method: 'POST', headers: this.headers(), body: JSON.stringify(body) },
      {
        provider: this.name,
        fetch: this.fetch,
        timeoutMs: this.timeoutMs,
        notFound: 'invalid_voice',
        signal: input.signal,
      },
    );
    if (typeof res.audio_base64 !== 'string' || !res.audio_base64)
      throw malformed(this.name, 'no audio');
    const audio = new Uint8Array(Buffer.from(res.audio_base64, 'base64'));
    const alignment = res.alignment?.characters?.length ? res.alignment : null;
    const lastEnd = alignment?.character_end_times_seconds.at(-1);
    const durationMs =
      input.format === 'pcm_24000'
        ? Math.round(audio.byteLength / 48)
        : lastEnd !== undefined
          ? Math.round(lastEnd * 1000)
          : 0;
    return { audio, format: input.format, mimeType: MIME[input.format], alignment, durationMs };
  }

  async describeVoice(voiceId: string, signal?: AbortSignal): Promise<AssetFacts> {
    const res = await callJson<VoiceResponse>(
      `${this.baseUrl}/v1/voices/${encodeURIComponent(voiceId)}`,
      { method: 'GET', headers: this.headers() },
      {
        provider: this.name,
        fetch: this.fetch,
        timeoutMs: this.timeoutMs,
        notFound: 'invalid_voice',
        signal,
      },
    );
    return { name: res.name ?? null, gender: res.labels?.gender ?? null };
  }

  /**
   * Voice Design (POST /v1/text-to-voice/design): generates candidate voices
   * from a description. Spends account credits; operator-run only.
   */
  async designVoice(input: {
    description: string;
  }): Promise<{ generatedVoiceId: string; audio: Uint8Array }[]> {
    const res = await callJson<{
      previews?: { generated_voice_id?: string; audio_base_64?: string }[];
    }>(
      `${this.baseUrl}/v1/text-to-voice/design`,
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ voice_description: input.description, auto_generate_text: true }),
      },
      { provider: this.name, fetch: this.fetch, timeoutMs: 120_000 },
    );
    const previews = (res.previews ?? []).flatMap((p) =>
      p.generated_voice_id && p.audio_base_64
        ? [
            {
              generatedVoiceId: p.generated_voice_id,
              audio: new Uint8Array(Buffer.from(p.audio_base_64, 'base64')),
            },
          ]
        : [],
    );
    if (!previews.length) throw malformed(this.name, 'no voice previews');
    return previews;
  }

  /** Saves a designed preview as a voice (POST /v1/text-to-voice) and returns its id. */
  async saveDesignedVoice(input: {
    name: string;
    description: string;
    generatedVoiceId: string;
    labels: Record<string, string>;
  }): Promise<string> {
    const res = await callJson<{ voice_id?: string }>(
      `${this.baseUrl}/v1/text-to-voice`,
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          voice_name: input.name,
          voice_description: input.description,
          generated_voice_id: input.generatedVoiceId,
          labels: input.labels,
        }),
      },
      { provider: this.name, fetch: this.fetch, timeoutMs: 60_000 },
    );
    if (!res.voice_id) throw malformed(this.name, 'no voice_id');
    return res.voice_id;
  }
}

/**
 * Voice preparation through ElevenLabs Voice Design: a voice is designed from
 * the character's voice identity, the first candidate is saved to the
 * account's library and its recorded gender is returned for validation.
 */
export class ElevenLabsVoiceGateway implements VoiceGateway {
  readonly provider = 'elevenlabs' as const;

  constructor(
    private readonly voices: ElevenLabsVoiceProvider,
    private readonly enabled = true,
  ) {}

  get canPrepare(): boolean {
    return this.enabled && this.voices.configured;
  }

  async prepareCharacterVoice(input: PrepareVoiceInput): Promise<PreparedVoice> {
    const [candidate] = await this.voices.designVoice({ description: input.description });
    if (!candidate) throw malformed('elevenlabs', 'no voice candidates');
    const voiceId = await this.voices.saveDesignedVoice({
      name: input.name,
      description: input.description,
      generatedVoiceId: candidate.generatedVoiceId,
      labels: { gender: input.presentation, use_case: 'philax-character' },
    });
    const facts = await this.voices.describeVoice(voiceId);
    return { voiceId, gender: facts.gender };
  }
}
