import type { DebateParticipant } from '@philax/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceGateway } from '../gateways';
import { BrowserSpeechVoiceProvider, type SpeechEngine } from '../providers/browser-speech';
import { MediaProfileRegistry } from '../registry';
import { StagePlayer } from './player';
import { planPresentation } from './presentation';

const ID = '00000000-0000-4000-8000-000000000001';
const participants: DebateParticipant[] = [
  {
    character: {
      id: ID,
      slug: 'hannah-arendt',
      displayName: 'Hannah Arendt',
      type: 'thinker',
      birthYear: 1906,
      deathYear: 1975,
      era: 'x',
      representation: 'historical',
      worldviewSummary: 'x',
    },
    role: 'debater',
    perspective: { slug: 'p', label: 'P' },
    selectionReason: 'x',
    seat: 0,
  },
];

function plan(content: string, id = 'm1') {
  const p = planPresentation(
    {
      id,
      debateId: 'd',
      roundNumber: 1,
      phase: 'OPENING',
      speaker: { type: 'character', characterId: ID },
      move: 'assert',
      content,
      argument: null,
      citations: [],
      replyToMessageId: null,
      addressedCharacterIds: [],
      createdAt: '',
    },
    participants,
    new MediaProfileRegistry(),
    'en',
  );
  if (!p) throw new Error('no plan');
  return p;
}

/** Device engine that speaks each word on a timer and reports boundaries. */
function fakeEngine(voices = [{ name: 'Samantha', lang: 'en-US', voiceURI: 's' }]) {
  const spoken: string[] = [];
  const engine: SpeechEngine = {
    getVoices: () => voices,
    speak(u, h) {
      spoken.push(u.text);
      const words = [...u.text.matchAll(/\S+/g)];
      const timers = words.map((w, i) => setTimeout(() => h.onBoundary(w.index ?? 0), i * 300));
      timers.push(setTimeout(() => h.onEnd(), words.length * 300));
      return { cancel: () => timers.forEach(clearTimeout) };
    },
  };
  return { engine, spoken };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('StagePlayer', () => {
  it('speaks each sentence with the voice and moves subtitles with its word boundaries', async () => {
    const { engine, spoken } = fakeEngine();
    const player = new StagePlayer(new VoiceGateway([new BrowserSpeechVoiceProvider(engine)]), {
      now: () => Date.now(),
    });
    player.enqueue(plan('Thinking matters. Action begins.'));
    await vi.advanceTimersByTimeAsync(10);
    expect(player.getSnapshot()).toMatchObject({ audio: 'voice', segmentIndex: 0, wordIndex: 0 });
    expect(player.getSnapshot().plan?.characterSlug).toBe('hannah-arendt');
    await vi.advanceTimersByTimeAsync(320);
    expect(player.getSnapshot().wordIndex).toBe(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(spoken).toEqual(['Thinking matters.', 'Action begins.']);
    expect(player.getSnapshot().plan).toBeNull();
  });

  it('animates the mouth only while speaking', async () => {
    const { engine } = fakeEngine();
    const player = new StagePlayer(new VoiceGateway([new BrowserSpeechVoiceProvider(engine)]));
    const visemes = new Set<string>();
    player.subscribe(() => visemes.add(player.getSnapshot().viseme));
    player.enqueue(plan('Mama papa.'));
    await vi.advanceTimersByTimeAsync(400);
    expect([...visemes].some((v) => v !== 'rest')).toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(player.getSnapshot().viseme).toBe('rest');
  });

  it('falls back to timed subtitles, not another voice, when no compatible voice exists', async () => {
    const { engine, spoken } = fakeEngine([{ name: 'Alex', lang: 'en-US', voiceURI: 'a' }]);
    const player = new StagePlayer(new VoiceGateway([new BrowserSpeechVoiceProvider(engine)]));
    player.enqueue(plan('Thinking matters.'));
    await vi.advanceTimersByTimeAsync(10);
    expect(player.getSnapshot()).toMatchObject({
      audio: 'text-only',
      voiceIssue: 'no_compatible_voice',
    });
    await vi.advanceTimersByTimeAsync(5000);
    expect(spoken).toEqual([]);
    expect(player.getSnapshot().plan).toBeNull();
  });

  it('plays turns in order, and plays a chosen turn immediately on request', async () => {
    const { engine, spoken } = fakeEngine();
    const player = new StagePlayer(new VoiceGateway([new BrowserSpeechVoiceProvider(engine)]));
    player.enqueue(plan('First turn.', 'a'));
    player.enqueue(plan('Second turn.', 'b'));
    player.enqueue(plan('Second turn.', 'b'));
    expect(player.getSnapshot().queued).toBe(1);
    await vi.advanceTimersByTimeAsync(10);
    player.playNow(plan('Replayed turn.', 'c'));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(spoken).toEqual(['First turn.', 'Replayed turn.']);
  });

  it('stays silent when muted', async () => {
    const { engine, spoken } = fakeEngine();
    const player = new StagePlayer(new VoiceGateway([new BrowserSpeechVoiceProvider(engine)]), {
      muted: true,
    });
    player.enqueue(plan('Quiet please.'));
    await vi.advanceTimersByTimeAsync(10);
    expect(player.getSnapshot().audio).toBe('muted');
    await vi.advanceTimersByTimeAsync(5000);
    expect(spoken).toEqual([]);
  });
});
