import type {
  DebateMessage,
  DebateRound,
  DebateStreamEvent,
  DebateView,
  PreparationStep,
} from '@philax/types';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiClientError } from '../api/client';
import { debatesApi } from '../api/debates';

export interface LiveDraft {
  turnId: string;
  characterId: string;
  text: string;
  revising: boolean;
}

export type StepStatus = Partial<Record<PreparationStep, 'started' | 'completed'>>;

const PREPARING = new Set(['DEBATE_CREATED', 'TOPIC_ANALYZED', 'CHARACTERS_SELECTED']);

export function isPreparing(view: DebateView | null): boolean {
  return Boolean(view && PREPARING.has(view.phase));
}

function withMessage(view: DebateView, message: DebateMessage): DebateView {
  if (view.messages.some((m) => m.id === message.id)) return view;
  return { ...view, messages: [...view.messages, message] };
}

/** Loads a debate and drives its state machine through streamed server events. */
export function useDebate(id: string) {
  const [view, setView] = useState<DebateView | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<StepStatus>({});
  const [draft, setDraft] = useState<LiveDraft | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [liveRound, setLiveRound] = useState<DebateRound | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const autoPrepared = useRef<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { debate } = await debatesApi.get(id);
      setView(debate);
    } catch (err) {
      setError(err);
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    debatesApi
      .get(id)
      .then(({ debate }) => {
        if (!cancelled) setView(debate);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err);
      });
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [id]);

  const onEvent = useCallback((e: DebateStreamEvent, names: Map<string, string>) => {
    switch (e.type) {
      case 'step':
        setSteps((s) => ({ ...s, [e.step]: e.status }));
        break;
      case 'round_started':
        setLiveRound({ number: e.roundNumber, phase: e.phase, status: 'generating' });
        break;
      case 'turn_started':
        setDraft({ turnId: e.turnId, characterId: e.characterId, text: '', revising: false });
        break;
      case 'draft':
        setDraft((d) =>
          d && d.turnId === e.turnId
            ? { ...d, text: e.reset ? e.delta : d.text + e.delta, revising: false }
            : d,
        );
        break;
      case 'discard':
        setDraft((d) => (d && d.turnId === e.turnId ? { ...d, text: '', revising: true } : d));
        break;
      case 'message': {
        setView((v) => (v ? withMessage(v, e.message) : v));
        setDraft(null);
        const speaker = e.message.speaker;
        if (speaker.type === 'character') setAnnouncement(names.get(speaker.characterId) ?? '');
        break;
      }
      case 'synthesis':
        setView((v) => (v ? { ...v, synthesis: e.synthesis } : v));
        break;
      case 'state':
        setView(e.debate);
        setLiveRound(null);
        break;
      case 'error':
        setError(new ApiClientError(e.code as never, e.message, 0, e.errorId));
        setDraft(null);
        break;
      default:
        break;
    }
  }, []);

  const run = useCallback(
    async (fn: (onEvent: (e: DebateStreamEvent) => void, signal: AbortSignal) => Promise<void>) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      const controller = new AbortController();
      abortRef.current = controller;
      const names = new Map(
        (view?.participants ?? []).map((p) => [p.character.id, p.character.displayName]),
      );
      try {
        await fn((e) => {
          if (e.type === 'state')
            e.debate.participants.forEach((p) =>
              names.set(p.character.id, p.character.displayName),
            );
          onEvent(e, names);
        }, controller.signal);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setError(err);
      } finally {
        setBusy(false);
        setDraft(null);
        setLiveRound(null);
      }
    },
    [busy, onEvent, view?.participants],
  );

  const advance = useCallback(
    () => run((cb, signal) => debatesApi.advance(id, cb, signal)),
    [id, run],
  );
  const sendMessage = useCallback(
    (content: string) => run((cb, signal) => debatesApi.sendMessage(id, content, cb, signal)),
    [id, run],
  );

  // Preparation starts automatically once (guarded against StrictMode double effects).
  useEffect(() => {
    if (view && isPreparing(view) && !busy && !error && autoPrepared.current !== id) {
      autoPrepared.current = id;
      void advance();
    }
  }, [view, busy, error, id, advance]);

  const setSaved = useCallback(
    async (saved: boolean) => {
      await debatesApi.setSaved(id, saved);
      setView((v) => (v ? { ...v, saved } : v));
    },
    [id],
  );

  return {
    view,
    error,
    busy,
    steps,
    draft,
    liveRound,
    announcement,
    advance,
    sendMessage,
    setSaved,
    reload: load,
  };
}
