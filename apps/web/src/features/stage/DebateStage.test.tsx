import {
  AvatarGateway,
  BrowserSpeechVoiceProvider,
  MediaProfileRegistry,
  ProceduralAvatarProvider,
  VoiceGateway,
  type SpeechEngine,
} from '@philax/media';
import type { DebateMessage, DebateParticipant, DebateView } from '@philax/types';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initI18n } from '../../lib/i18n';
import { MessageCard } from '../debate/MessageCard';
import { DebateStage } from './DebateStage';
import { MediaServicesContext, type MediaServices } from './media-services';
import { useStage } from './useStage';

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
    perspective: { slug: slug, label: `${name} perspective` },
    selectionReason: 'x',
    seat,
  };
}

const participants = [
  participant(ids.nietzsche, 'friedrich-nietzsche', 'Friedrich Nietzsche', 0),
  participant(ids.marx, 'karl-marx', 'Karl Marx', 1),
  participant(ids.arendt, 'hannah-arendt', 'Hannah Arendt', 2),
];

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
    id: 'd',
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

function services(engine: SpeechEngine | null = null): MediaServices {
  return {
    registry: new MediaProfileRegistry(),
    avatars: new AvatarGateway([new ProceduralAvatarProvider()]),
    voices: new VoiceGateway([new BrowserSpeechVoiceProvider(engine)]),
  };
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

function renderStage(view: DebateView, media = services()) {
  const ui = (v: DebateView) => (
    <MediaServicesContext.Provider value={media}>
      <Harness view={v} />
    </MediaServicesContext.Provider>
  );
  const result = render(ui(view));
  return { ...result, update: (v: DebateView) => result.rerender(ui(v)) };
}

beforeEach(() => {
  initI18n('en');
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => vi.useRealTimers());

describe('DebateStage', () => {
  it('shows the whole cast with their own portraits and an idle stage', async () => {
    renderStage(debate([]));
    const stage = screen.getByRole('region', { name: 'Debate stage' });
    for (const p of participants)
      expect(within(stage).getByText(p.character.displayName)).toBeInTheDocument();
    expect(within(stage).getAllByText('Waiting')).toHaveLength(3);
    expect(within(stage).getByText(/stage is quiet/)).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(10));
    expect(stage.querySelectorAll('svg.portrait')).toHaveLength(3);
  });

  it('presents a new turn: speaker in focus with subtitles, the others listening', async () => {
    const { update } = renderStage(debate([]));
    await act(() => vi.advanceTimersByTimeAsync(10));
    update(debate([message('m1', ids.arendt, 'Thinking matters [E1]. Action begins.')]));
    await act(() => vi.advanceTimersByTimeAsync(20));

    const stage = screen.getByRole('region', { name: 'Debate stage' });
    expect(within(stage).getByText('Now speaking:')).toBeInTheDocument();
    expect(
      within(stage).getByRole('img', { name: 'Portrait of Hannah Arendt (AI reconstruction)' }),
    ).toBeInTheDocument();
    expect(within(stage).getByText(/are generated; they are not historical/)).toBeInTheDocument();
    expect(stage.querySelector('.stage__subtitles')?.textContent?.trim()).toBe('Thinking matters.');
    expect(within(stage).getByText('Speaking')).toBeInTheDocument();
    expect(within(stage).getAllByText('Listening')).toHaveLength(2);
    // No device voice in this environment: subtitles only, never a substitute voice.
    expect(within(stage).getByText(/subtitles only/)).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(within(stage).getByText(/stage is quiet/)).toBeInTheDocument();
  });

  it('does not replay turns that were already on the page, but replays one on request', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderStage(debate([message('m1', ids.marx, 'History is class struggle.')]));
    await act(() => vi.advanceTimersByTimeAsync(20));
    const stage = screen.getByRole('region', { name: 'Debate stage' });
    expect(within(stage).queryByText('Now speaking:')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Listen to Karl Marx' }));
    await act(() => vi.advanceTimersByTimeAsync(20));
    expect(within(stage).getByRole('img', { name: /Portrait of Karl Marx/ })).toBeInTheDocument();
  });

  it('speaks with a device voice that matches the character', async () => {
    const speak = vi.fn((_u: unknown, h: { onEnd(): void }) => {
      setTimeout(() => h.onEnd(), 100);
      return { cancel: () => undefined };
    });
    const engine: SpeechEngine = {
      getVoices: () => [
        { name: 'Microsoft David - English (United States)', lang: 'en-US', voiceURI: 'd' },
        { name: 'Microsoft Zira - English (United States)', lang: 'en-US', voiceURI: 'z' },
      ],
      speak,
    };
    const { update } = renderStage(debate([]), services(engine));
    update(debate([message('m1', ids.arendt, 'Thinking matters.')]));
    await act(() => vi.advanceTimersByTimeAsync(50));
    expect(speak).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Thinking matters.',
        voice: expect.objectContaining({ voiceURI: 'z' }),
      }),
      expect.anything(),
    );
    expect(screen.queryByText(/subtitles only/)).not.toBeInTheDocument();
  });

  it('shows a neutral monogram, not a borrowed face, for a character without a profile', async () => {
    const cast = [...participants, participant(ids.newcomer, 'new-thinker', 'New Thinker', 3)];
    const { update } = renderStage(debate([], cast));
    update(debate([message('m1', ids.newcomer, 'A new idea.')], cast));
    await act(() => vi.advanceTimersByTimeAsync(20));
    const stage = screen.getByRole('region', { name: 'Debate stage' });
    expect(
      within(stage).getByRole('img', { name: 'New Thinker: no verified portrait yet' }),
    ).toHaveTextContent('NT');
    expect(stage.querySelectorAll('svg.portrait')).toHaveLength(3);
  });

  it('lets the user mute the voice', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderStage(debate([]));
    const mute = screen.getByRole('button', { name: 'Mute voice' });
    await user.click(mute);
    expect(screen.getByRole('button', { name: 'Turn voice on' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
