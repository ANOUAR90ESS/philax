import {
  StagePlayer,
  planPresentation,
  stageStates,
  type AvatarOutcome,
  type AvatarState,
} from '@philax/media';
import type { DebateMessage, DebateView } from '@philax/types';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { LiveDraft } from '../../hooks/useDebate';
import { useMediaServices } from './media-services';

const MUTE_KEY = 'philax.stage.muted';

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeMuted(muted: boolean) {
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // Storage unavailable (private mode): the choice lasts for this page only.
  }
}

/**
 * Connects the debate to the stage: turns that arrive while the page is open
 * are presented in order; earlier turns can be replayed on request.
 */
const NO_PARTICIPANTS: DebateView['participants'] = [];

export function useStage(debate: DebateView | null, draft: LiveDraft | null) {
  const services = useMediaServices();
  const [player] = useState(
    () => new StagePlayer(services.voices, { muted: readMuted(), playClip: services.playClip }),
  );
  const snapshot = useSyncExternalStore(player.subscribe, player.getSnapshot, player.getSnapshot);
  const [muted, setMutedState] = useState(() => player.isMuted());
  const [avatars, setAvatars] = useState<Map<string, AvatarOutcome>>(new Map());
  const seen = useRef<Set<string> | null>(null);
  const participants = debate?.participants ?? NO_PARTICIPANTS;
  const language = debate?.language ?? 'en';
  const messages = debate?.messages;

  useEffect(() => () => player.dispose(), [player]);

  // Resolve each participant's avatar through the gateway (validated against identity).
  const participantKey = participants.map((p) => `${p.character.id}:${p.character.slug}`).join();
  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      participants.map(async (p) => {
        const media = services.registry.resolve(p.character.slug);
        const outcome: AvatarOutcome =
          media.status === 'ready'
            ? await services.avatars.avatarFor(media)
            : { status: 'unavailable', reason: 'no_provider' };
        return [p.character.id, outcome] as const;
      }),
    ).then((entries) => {
      if (!cancelled) setAvatars(new Map(entries));
    });
    return () => {
      cancelled = true;
    };
    // participantKey captures the identity of the cast.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participantKey, services]);

  // Present new character turns as they arrive.
  useEffect(() => {
    if (!messages) return;
    // Turns already on the page when it opens are not replayed automatically.
    if (!seen.current) {
      seen.current = new Set(messages.map((m) => m.id));
      return;
    }
    for (const m of messages) {
      if (seen.current.has(m.id)) continue;
      seen.current.add(m.id);
      const plan = planPresentation(m, participants, services.registry, language);
      if (plan) player.enqueue(plan);
    }
  }, [messages, participants, language, services, player]);

  const play = useCallback(
    (message: DebateMessage) => {
      const plan = planPresentation(message, participants, services.registry, language);
      if (plan) player.playNow(plan);
    },
    [participants, language, services, player],
  );

  const setMuted = useCallback(
    (value: boolean) => {
      player.setMuted(value);
      setMutedState(value);
      writeMuted(value);
    },
    [player],
  );

  const states: Record<string, AvatarState> = snapshot.plan
    ? snapshot.plan.states
    : stageStates(
        participants.map((p) => p.character.id),
        { thinkingCharacterId: draft?.characterId },
      );

  return {
    snapshot,
    states,
    avatars,
    muted,
    setMuted,
    play,
    skip: () => player.skip(),
    registry: services.registry,
  };
}

export type StageController = ReturnType<typeof useStage>;
