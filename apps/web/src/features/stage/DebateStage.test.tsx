import type {
  AvatarSpeakEvent,
  CharacterMediaView,
  DebateMessage,
  DebateParticipant,
  DebateView,
  MediaStatus,
} from '@philax/types';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '../../api/client';
import type { MediaApi } from '../../api/media';
import { initI18n } from '../../lib/i18n';
import { MessageCard } from '../debate/MessageCard';
import { DebateStage } from './DebateStage';
import type { LiveViewer, MediaElementLike, PlaybackDeps } from './playback';
import { PlaybackDepsContext, useStage } from './useStage';

// Mocked API, media elements and viewer: automated tests only.
const ids = {
  nietzsche: '00000000-0000-4000-8000-000000000001',
  marx: '00000000-0000-4000-8000-000000000002',
  arendt: '00000000-0000-4000-8000-000000000003',
  newcomer: '00000000-0000-4000-8000-000000000004',
};

function participant(id: string, slug: string, name: string, seat: number): DebateParticipant {
  return {
    character: {
      id,
      slug,
      displayName: name,
      type: 'philosopher',
      birthYear: 1800,
      deathYear: 1900,
      era: 'x',
      representation: 'historical',
      worldviewSummary: 'x',
    },
    role: 'debater',
    perspective: { slug, label: `${name} perspective` },
    selectionReason: 'x',
    seat,
  };
}

const participants = [
  participant(ids.nietzsche, 'friedrich-nietzsche', 'Friedrich Nietzsche', 0),
  participant(ids.marx, 'karl-marx', 'Karl Marx', 1),
  participant(ids.arendt, 'hannah-arendt', 'Hannah Arendt', 2),
];

const messageId = (n: number) => `10000000-0000-4000-8000-00000000000${n}`;

function message(id: string, characterId: string, content: string): DebateMessage {
  return {
    id,
    debateId: 'd',
    roundNumber: 1,
    phase: 'OPENING',
    speaker: { type: 'character', characterId },
    move: 'assert',
    content,
    argument: null,
    citations: [],
    replyToMessageId: null,
    addressedCharacterIds: [],
    createdAt: '',
  };
}

function debate(messages: DebateMessage[], cast = participants): DebateView {
  return {
    id: '20000000-0000-4000-8000-000000000000',
    mode: 'debate',
    phase: 'OPENING',
    input: { type: 'text', preview: 'x', sourceUrl: null },
    topic: null,
    participants: cast,
    rounds: [],
    plannedRounds: 3,
    messages,
    disagreementAxes: [],
    challenge: null,
    synthesis: null,
    canUserJoin: false,
    nextAction: 'advance',
    saved: false,
    language: 'en',
    createdAt: '',
  };
}

const NOT_CONFIGURED: MediaStatus = {
  voice: { provider: 'elevenlabs', configured: false },
  avatar: { provider: 'heygen', mode: 'live', configured: false },
};
const CONFIGURED: MediaStatus = {
  voice: { provider: 'elevenlabs', configured: true },
  avatar: { provider: 'heygen', mode: 'live', configured: true },
};

const unavailable = (reason: 'provider_not_configured' | 'not_configured') =>
  ({ status: 'unavailable', reason }) as const;

function castViews(
  voice: CharacterMediaView['voice'],
  avatar: CharacterMediaView['avatar'],
): CharacterMediaView[] {
  return participants.map((p) => ({ characterId: p.character.id, voice, avatar }));
}

function fakeAudio() {
  const el = {
    src: '',
    muted: false,
    currentTime: 0,
    onended: null as MediaElementLike['onended'],
    onerror: null as MediaElementLike['onerror'],
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(),
  };
  return el;
}

function setup(status: MediaStatus, cast: CharacterMediaView[]) {
  const audio = fakeAudio();
  const viewer: LiveViewer = {
    connect: vi.fn(() => Promise.resolve()),
    setMuted: vi.fn(),
    disconnect: vi.fn(() => Promise.resolve()),
  };
  let speakHandler: ((e: AvatarSpeakEvent) => void) | null = null;
  const api = {
    status: vi.fn(() => Promise.resolve({ status })),
    cast: vi.fn(() => Promise.resolve({ status, cast })),
    speech: vi.fn(() =>
      Promise.resolve({
        speech: {
          text: 'Thinking matters. Action begins.',
          audio: 'SUQz',
          mimeType: 'audio/mpeg',
          alignment: null,
          durationMs: 2000,
        },
      }),
    ),
    openSession: vi.fn(() =>
      Promise.resolve({
        session: {
          sessionId: 's-1',
          characterId: ids.arendt,
          livekitUrl: 'wss://room',
          livekitToken: 'viewer-token',
          maxDurationSeconds: null,
        },
      }),
    ),
    speak: vi.fn((_id: string, _body: unknown, onEvent: (e: AvatarSpeakEvent) => void) => {
      speakHandler = onEvent;
      return new Promise<void>(() => undefined);
    }),
    interrupt: vi.fn(() => Promise.resolve(undefined)),
    closeSession: vi.fn(() => Promise.resolve(undefined)),
    renderVideo: vi.fn(),
    videoStatus: vi.fn(),
  };
  const deps: PlaybackDeps = {
    api: api as unknown as MediaApi,
    createAudio: () => audio as unknown as MediaElementLike,
    createViewer: () => Promise.resolve(viewer),
    tickMs: 20,
  };
  return { deps, api, audio, viewer, emit: (e: AvatarSpeakEvent) => speakHandler?.(e) };
}

function Harness({ view }: { view: DebateView }) {
  const stage = useStage(view, null);
  return (
    <>
      <DebateStage debate={view} draft={null} stage={stage} />
      {view.messages.map((m) => (
        <MessageCard
          key={m.id}
          message={m}
          participants={new Map(view.participants.map((p) => [p.character.id, p]))}
          messages={new Map()}
          onListen={stage.play}
        />
      ))}
    </>
  );
}

function renderStage(view: DebateView, deps: PlaybackDeps) {
  const ui = (v: DebateView) => (
    <PlaybackDepsContext.Provider value={deps}>
      <Harness view={v} />
    </PlaybackDepsContext.Provider>
  );
  const result = render(ui(view));
  return { ...result, update: (v: DebateView) => result.rerender(ui(v)) };
}

const stageRegion = () => screen.getByRole('region', { name: 'Debate stage' });
const subtitles = () => stageRegion().querySelector('.stage__subtitles')?.textContent?.trim();

beforeEach(() => {
  initI18n('en');
  window.localStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => vi.useRealTimers());

describe('DebateStage', () => {
  it('shows the cast without any provider status', async () => {
    const { deps } = setup(
      NOT_CONFIGURED,
      castViews(unavailable('provider_not_configured'), unavailable('provider_not_configured')),
    );
    renderStage(debate([]), deps);
    await act(() => vi.advanceTimersByTimeAsync(10));
    const stage = stageRegion();
    for (const p of participants)
      expect(within(stage).getByText(p.character.displayName)).toBeInTheDocument();
    expect(within(stage).getAllByText('Waiting')).toHaveLength(3);
    expect(within(stage).queryByText(/provider|configured/i)).toBeNull();
    expect(stage.querySelectorAll('svg.portrait')).toHaveLength(3);
  });

  it('without providers, presents a turn as captions and says why, without calling any provider', async () => {
    const { deps, api } = setup(
      NOT_CONFIGURED,
      castViews(unavailable('provider_not_configured'), unavailable('provider_not_configured')),
    );
    const { update } = renderStage(debate([]), deps);
    await act(() => vi.advanceTimersByTimeAsync(10));
    update(debate([message(messageId(1), ids.arendt, 'Thinking matters [E1]. Action begins.')]));
    await act(() => vi.advanceTimersByTimeAsync(50));

    const stage = stageRegion();
    expect(within(stage).getByText('Now speaking:')).toBeInTheDocument();
    expect(
      within(stage).getByRole('img', { name: 'Portrait of Hannah Arendt (AI reconstruction)' }),
    ).toBeInTheDocument();
    expect(within(stage).getByText(/are generated; they are not historical/)).toBeInTheDocument();
    expect(subtitles()).toBe('Thinking matters.');
    expect(within(stage).getByText('Speaking')).toBeInTheDocument();
    expect(within(stage).getAllByText('Listening')).toHaveLength(2);
    expect(
      within(stage).getByText('Voice unavailable: this participant has none.'),
    ).toBeInTheDocument();
    expect(
      within(stage).getByText('Avatar unavailable: this participant has none.'),
    ).toBeInTheDocument();
    expect(api.speech).not.toHaveBeenCalled();
    expect(api.openSession).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(within(stage).getByText(/stage is quiet/)).toBeInTheDocument();
  });

  it('plays the character’s own voice (by turn id, never by text) when the avatar is off', async () => {
    window.localStorage.setItem('philax.stage.prefs', JSON.stringify({ avatar: false }));
    const { deps, api, audio } = setup(
      CONFIGURED,
      castViews({ status: 'ready' }, { status: 'ready' }),
    );
    const { update } = renderStage(debate([]), deps);
    await act(() => vi.advanceTimersByTimeAsync(10));
    update(debate([message(messageId(1), ids.arendt, 'Thinking matters. Action begins.')]));
    await act(() => vi.advanceTimersByTimeAsync(50));
    expect(api.speech).toHaveBeenCalledWith(
      { debateId: debate([]).id, messageId: messageId(1), speed: 'normal', fromSegment: 0 },
      expect.anything(),
    );
    expect(audio.src).toBe('data:audio/mpeg;base64,SUQz');
    expect(audio.play).toHaveBeenCalled();
    expect(subtitles()).toBe('Thinking matters.');
    audio.currentTime = 1.5;
    await act(() => vi.advanceTimersByTimeAsync(50));
    expect(subtitles()).toBe('Action begins.');
    act(() => audio.onended?.call(audio as unknown as GlobalEventHandlers, new Event('ended')));
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(screen.getByText(/stage is quiet/)).toBeInTheDocument();
  });

  it('shows Voice unavailable with Retry when the provider fails, and keeps the turn readable', async () => {
    window.localStorage.setItem('philax.stage.prefs', JSON.stringify({ avatar: false }));
    const { deps, api } = setup(CONFIGURED, castViews({ status: 'ready' }, { status: 'ready' }));
    api.speech.mockRejectedValueOnce(
      new ApiClientError('MEDIA_UNAVAILABLE', 'x', 503, 'e', {
        kind: 'voice',
        reason: 'rate_limited',
        retryAfterMs: 1000,
      }),
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { update } = renderStage(debate([]), deps);
    await act(() => vi.advanceTimersByTimeAsync(10));
    update(debate([message(messageId(1), ids.marx, 'History is class struggle.')]));
    await act(() => vi.advanceTimersByTimeAsync(50));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Voice unavailable: too many requests, try again shortly.',
    );
    expect(subtitles()).toBe('History is class struggle.');
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await act(() => vi.advanceTimersByTimeAsync(50));
    expect(api.speech).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('never calls a provider when both voice and avatar are off', async () => {
    window.localStorage.setItem(
      'philax.stage.prefs',
      JSON.stringify({ avatar: false, muted: true }),
    );
    const { deps, api } = setup(CONFIGURED, castViews({ status: 'ready' }, { status: 'ready' }));
    const { update } = renderStage(debate([]), deps);
    await act(() => vi.advanceTimersByTimeAsync(10));
    update(debate([message(messageId(1), ids.marx, 'History is class struggle.')]));
    await act(() => vi.advanceTimersByTimeAsync(50));
    expect(subtitles()).toBe('History is class struggle.');
    expect(api.speech).not.toHaveBeenCalled();
    expect(api.openSession).not.toHaveBeenCalled();
  });

  it('runs a real-time avatar: joins the room, then starts captions when the avatar starts speaking', async () => {
    const { deps, api, viewer, emit } = setup(
      CONFIGURED,
      castViews({ status: 'ready' }, { status: 'ready' }),
    );
    const { update } = renderStage(debate([]), deps);
    await act(() => vi.advanceTimersByTimeAsync(10));
    update(debate([message(messageId(1), ids.arendt, 'Thinking matters. Action begins.')]));
    await act(() => vi.advanceTimersByTimeAsync(50));
    expect(api.openSession).toHaveBeenCalledWith({
      debateId: debate([]).id,
      characterId: ids.arendt,
    });
    expect(viewer.connect).toHaveBeenCalledWith(
      'wss://room',
      'viewer-token',
      expect.any(HTMLVideoElement),
    );
    expect(api.speak).toHaveBeenCalledWith(
      's-1',
      expect.objectContaining({ messageId: messageId(1) }),
      expect.any(Function),
      expect.anything(),
    );
    expect(screen.getByText('Starting the avatar…')).toBeInTheDocument();

    act(() =>
      emit({
        type: 'alignment',
        text: 'Thinking matters. Action begins.',
        alignment: null,
        durationMs: 2000,
      }),
    );
    act(() => emit({ type: 'speak_started' }));
    await act(() => vi.advanceTimersByTimeAsync(40));
    expect(screen.getByLabelText('Avatar of Hannah Arendt (AI reconstruction)')).toBeVisible();
    expect(subtitles()).toBe('Thinking matters.');

    act(() => emit({ type: 'speak_ended' }));
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(screen.getByText(/stage is quiet/)).toBeInTheDocument();
  });

  it('replays an earlier turn on request but not automatically', async () => {
    const { deps } = setup(
      NOT_CONFIGURED,
      castViews(unavailable('provider_not_configured'), unavailable('provider_not_configured')),
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderStage(debate([message(messageId(1), ids.marx, 'History is class struggle.')]), deps);
    await act(() => vi.advanceTimersByTimeAsync(20));
    expect(within(stageRegion()).queryByText('Now speaking:')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Listen to Karl Marx' }));
    await act(() => vi.advanceTimersByTimeAsync(20));
    expect(
      within(stageRegion()).getByRole('img', { name: /Portrait of Karl Marx/ }),
    ).toBeInTheDocument();
  });

  it('shows a neutral monogram, not a borrowed face, for a character without an identity brief', async () => {
    const cast = [...participants, participant(ids.newcomer, 'new-thinker', 'New Thinker', 3)];
    const { deps } = setup(NOT_CONFIGURED, []);
    const { update } = renderStage(debate([], cast), deps);
    update(debate([message(messageId(1), ids.newcomer, 'A new idea.')], cast));
    await act(() => vi.advanceTimersByTimeAsync(20));
    expect(
      within(stageRegion()).getByRole('img', { name: 'New Thinker: no verified portrait yet' }),
    ).toHaveTextContent('NT');
  });

  it('lets the user mute, pause, hide captions, hide the avatar and choose a speed', async () => {
    const { deps } = setup(
      NOT_CONFIGURED,
      castViews(unavailable('provider_not_configured'), unavailable('provider_not_configured')),
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { update } = renderStage(debate([]), deps);
    update(debate([message(messageId(1), ids.marx, 'History is class struggle. It continues.')]));
    await act(() => vi.advanceTimersByTimeAsync(30));

    await user.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(subtitles()).toBe('History is class struggle.');
    await user.click(screen.getByRole('button', { name: 'Resume' }));

    await user.click(screen.getByRole('button', { name: 'Hide captions' }));
    expect(subtitles()).toBeUndefined();
    await user.click(screen.getByRole('button', { name: 'Mute voice' }));
    expect(screen.getByRole('button', { name: 'Turn voice on' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Hide avatar' }));
    expect(screen.getByRole('button', { name: 'Show avatar' })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Voice speed'), 'fast');
    expect(JSON.parse(window.localStorage.getItem('philax.stage.prefs') ?? '{}')).toEqual({
      muted: true,
      captions: false,
      avatar: false,
      speed: 'fast',
    });
  });
});
