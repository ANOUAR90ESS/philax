import { describe, expect, it, vi } from 'vitest';
import { AvatarGateway, MediaCache, VoiceGateway, planDelivery } from '../gateways';
import { segmentSpeech } from '../lipsync/visemes';
import { MediaProfileRegistry, type ProfileResolution } from '../registry';
import {
  BrowserSpeechVoiceProvider,
  classifyDeviceVoice,
  compatibleDeviceVoices,
  createWebSpeechEngine,
  type DeviceVoice,
  type SpeechEngine,
} from './browser-speech';
import { ProceduralAvatarProvider } from './procedural-avatar';
import { ElevenLabsVoiceProvider, HeyGenAvatarProvider } from './remote';
import type { AvatarProvider, VoiceProvider } from './types';

const v = (name: string, lang: string): DeviceVoice => ({
  name,
  lang,
  voiceURI: `${name}|${lang}`,
});
const VOICES = [
  v('Microsoft David - English (United States)', 'en-US'),
  v('Microsoft Zira - English (United States)', 'en-US'),
  v('Google UK English Male', 'en-GB'),
  v('Samantha', 'en-US'),
  v('Mónica', 'es-ES'),
  v('Jorge', 'es-ES'),
  v('Microsoft Hamed Online (Natural) - Arabic (Saudi Arabia)', 'ar-SA'),
  v('Microsoft Zariyah Online (Natural) - Arabic (Saudi Arabia)', 'ar-SA'),
  v('Narrator X', 'en-US'),
];

function engine(voices = VOICES): SpeechEngine & { spoken: unknown[] } {
  const spoken: unknown[] = [];
  return {
    spoken,
    getVoices: () => voices,
    speak(u, handlers) {
      spoken.push(u);
      handlers.onBoundary(0);
      handlers.onEnd();
      return { cancel: () => undefined };
    },
  };
}

function must<T>(x: T | undefined): T {
  if (x === undefined) throw new Error('missing');
  return x;
}

const registry = new MediaProfileRegistry();
function ready(slug: string) {
  const r = registry.resolve(slug);
  if (r.status !== 'ready') throw new Error(slug);
  return r;
}

describe('device voice selection', () => {
  it('classifies only voices whose presentation is documented', () => {
    expect(classifyDeviceVoice(must(VOICES[0]))).toBe('male');
    expect(classifyDeviceVoice(must(VOICES[1]))).toBe('female');
    expect(classifyDeviceVoice(must(VOICES[2]))).toBe('male');
    expect(classifyDeviceVoice(must(VOICES[4]))).toBe('female');
    expect(classifyDeviceVoice(must(VOICES[6]))).toBe('male');
    expect(classifyDeviceVoice(must(VOICES[8]))).toBe('unknown');
  });

  it('filters by language and presentation', () => {
    expect(compatibleDeviceVoices(VOICES, 'female', 'ar').map((x) => x.name)).toEqual([
      'Microsoft Zariyah Online (Natural) - Arabic (Saudi Arabia)',
    ]);
    expect(compatibleDeviceVoices(VOICES, 'male', 'es-MX').map((x) => x.name)).toEqual(['Jorge']);
    expect(compatibleDeviceVoices(VOICES, 'unknown', 'en')).toEqual([]);
  });

  it('keeps the character identity across languages', async () => {
    const e = engine();
    const gateway = new VoiceGateway([new BrowserSpeechVoiceProvider(e)]);
    for (const lang of ['en', 'es', 'ar']) {
      const out = await gateway.synthesize(ready('hannah-arendt'), 'Hola', lang);
      expect(out.status).toBe('ready');
      if (out.status === 'ready' && out.audio.kind === 'stream')
        out.audio.playback.start({ onBoundary: () => {}, onEnd: () => {}, onError: () => {} });
    }
    const spoken = e.spoken as { voice: DeviceVoice; pitch: number; rate: number }[];
    expect(spoken.map((s) => classifyDeviceVoice(s.voice))).toEqual(['female', 'female', 'female']);
    expect(new Set(spoken.map((s) => `${s.pitch}/${s.rate}`)).size).toBe(1);
  });

  it('reports no compatible voice instead of using a mismatched one', async () => {
    const onlyMale = [v('Microsoft Hamed Online (Natural) - Arabic (Saudi Arabia)', 'ar-SA')];
    const gateway = new VoiceGateway([new BrowserSpeechVoiceProvider(engine(onlyMale))]);
    expect(await gateway.synthesize(ready('simone-de-beauvoir'), 'x', 'ar')).toEqual({
      status: 'unavailable',
      reason: 'no_compatible_voice',
    });
    expect((await gateway.synthesize(ready('karl-marx'), 'x', 'ar')).status).toBe('ready');
    expect(await gateway.synthesize(ready('karl-marx'), 'x', 'de')).toEqual({
      status: 'unavailable',
      reason: 'no_language_voice',
    });
    const none = new VoiceGateway([new BrowserSpeechVoiceProvider(null)]);
    expect((await none.synthesize(ready('karl-marx'), 'x', 'en')).status).toBe('unavailable');
  });

  it('spreads characters over the compatible device voices deterministically', () => {
    const provider = new BrowserSpeechVoiceProvider(engine());
    const pick = (slug: string) => {
      const p = ready(slug).profile;
      return provider.pickVoice({
        profile: p,
        voiceId: must(p.voice.languageVoices.en),
        text: '',
        language: 'en',
      })?.name;
    };
    expect(pick('karl-marx')).toBe(pick('karl-marx'));
    const males = ['karl-marx', 'friedrich-nietzsche', 'plato', 'immanuel-kant', 'david-hume'];
    expect(new Set(males.map(pick)).size).toBe(2);
  });

  it('wraps window.speechSynthesis and is absent where unsupported', () => {
    expect(createWebSpeechEngine({} as never)).toBeNull();
    const speak = vi.fn();
    class FakeUtterance {
      constructor(public text: string) {}
    }
    const e = createWebSpeechEngine({
      speechSynthesis: { getVoices: () => VOICES, speak, cancel: vi.fn() },
      SpeechSynthesisUtterance: FakeUtterance,
    } as never);
    expect(e?.getVoices()).toHaveLength(VOICES.length);
    e?.speak(
      { text: 'hi', lang: 'en-US', voice: must(VOICES[0]), pitch: 0.9, rate: 1 },
      { onBoundary: () => {}, onEnd: () => {}, onError: () => {} },
    );
    expect(speak).toHaveBeenCalledWith(expect.objectContaining({ text: 'hi', pitch: 0.9 }));
  });
});

describe('gateways', () => {
  it('returns the procedural avatar only when it presents as the character', async () => {
    const gateway = new AvatarGateway([new ProceduralAvatarProvider()]);
    const out = await gateway.avatarFor(ready('hannah-arendt'));
    expect(out).toMatchObject({ status: 'ready', avatar: { presentation: 'female' } });

    const lying: AvatarProvider = {
      id: 'procedural-svg',
      capabilities: new ProceduralAvatarProvider().capabilities,
      renderSpeech: async () => ({ kind: 'realtime' }),
      generateAvatar: async ({ profile }) => ({
        provider: 'procedural-svg',
        avatarId: profile.avatar.avatarId,
        presentation: 'male',
        kind: 'procedural',
      }),
    };
    expect(await new AvatarGateway([lying]).avatarFor(ready('hannah-arendt'))).toEqual({
      status: 'unavailable',
      reason: 'avatar_identity_mismatch',
    });
  });

  it('reports unconfigured remote providers instead of substituting', async () => {
    const r = ready('karl-marx');
    const remote: ProfileResolution = {
      ...r,
      profile: {
        ...r.profile,
        avatar: { ...r.profile.avatar, provider: 'heygen' },
        voice: { ...r.profile.voice, provider: 'elevenlabs' },
      },
    };
    if (remote.status !== 'ready') throw new Error();
    expect(
      await new VoiceGateway([new ElevenLabsVoiceProvider()]).synthesize(remote, 'x', 'en'),
    ).toEqual({
      status: 'unavailable',
      reason: 'not_configured',
    });
    expect(await new AvatarGateway([new HeyGenAvatarProvider()]).avatarFor(remote)).toEqual({
      status: 'unavailable',
      reason: 'not_configured',
    });
  });

  it('caches synthesized clips so the same speech is paid for once', async () => {
    const synthesize = vi.fn(async () => ({
      kind: 'clip' as const,
      url: 'blob:1',
      durationMs: 900,
    }));
    const provider: VoiceProvider = {
      id: 'browser-speech',
      capabilities: new BrowserSpeechVoiceProvider(null).capabilities,
      synthesize,
    };
    const gateway = new VoiceGateway([provider]);
    await gateway.synthesize(ready('plato'), 'Know thyself.', 'en');
    await gateway.synthesize(ready('plato'), 'Know thyself.', 'en');
    await gateway.synthesize(ready('plato'), 'Know thyself.', 'es');
    expect(synthesize).toHaveBeenCalledTimes(2);
  });

  it('chooses delivery from latency, cost and reuse', () => {
    const heygen = new HeyGenAvatarProvider().capabilities;
    const local = new ProceduralAvatarProvider().capabilities;
    expect(planDelivery(local, { maxLatencyMs: 500, maxCostPerMinuteUsd: 0 }, false)).toBe(
      'realtime',
    );
    expect(planDelivery(heygen, { maxLatencyMs: 500, maxCostPerMinuteUsd: 5 }, false)).toBe(
      'still',
    );
    expect(planDelivery(heygen, { maxLatencyMs: 3000, maxCostPerMinuteUsd: 5 }, false)).toBe(
      'streaming',
    );
    expect(planDelivery(heygen, { maxLatencyMs: 3000, maxCostPerMinuteUsd: 0.5 }, false)).toBe(
      'still',
    );
    const pre = { ...heygen, delivery: 'prerendered' as const, typicalLatencyMs: 20_000 };
    expect(planDelivery(pre, { maxLatencyMs: 3000, maxCostPerMinuteUsd: 5 }, true)).toBe(
      'prerendered',
    );
    expect(planDelivery(pre, { maxLatencyMs: 3000, maxCostPerMinuteUsd: 5 }, false)).toBe('still');
  });

  it('renders speech in real time for the procedural avatar', async () => {
    const gateway = new AvatarGateway([new ProceduralAvatarProvider()]);
    const segment = must(segmentSpeech('Hello.')[0]);
    expect(
      await gateway.renderSpeech(
        ready('plato'),
        segment,
        { kind: 'clip', url: 'x', durationMs: 1 },
        'en',
      ),
    ).toEqual({ kind: 'realtime' });
  });

  it('evicts the least recently used cache entry', () => {
    const cache = new MediaCache<number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a');
    cache.set('c', 3);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    expect(cache.size).toBe(2);
  });
});
