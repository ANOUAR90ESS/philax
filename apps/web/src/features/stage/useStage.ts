import type { DebateMessage, DebateView } from '@philax/types';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { mediaApi } from '../../api/media';
import type { LiveDraft } from '../../hooks/useDebate';
import { DEFAULT_PREFS, StagePlayback, type PlaybackDeps, type StagePrefs } from './playback';

const PREFS_KEY = 'philax.stage.prefs';

function readPrefs(): StagePrefs {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const p = JSON.parse(raw) as Partial<StagePrefs>;
    return {
      muted: typeof p.muted === 'boolean' ? p.muted : DEFAULT_PREFS.muted,
      captions: typeof p.captions === 'boolean' ? p.captions : DEFAULT_PREFS.captions,
      avatar: typeof p.avatar === 'boolean' ? p.avatar : DEFAULT_PREFS.avatar,
      speed: p.speed === 'slow' || p.speed === 'fast' ? p.speed : 'normal',
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefs(prefs: StagePrefs) {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Storage unavailable (private mode): the choice lasts for this page only.
  }
}

export function browserPlaybackDeps(): PlaybackDeps {
  return {
    api: mediaApi,
    createAudio: () => new Audio(),
    createViewer: async () => (await import('./livekit-viewer')).createLiveKitViewer(),
    savePrefs,
  };
}

/** Lets tests supply playback dependencies (mocked API and media elements). */
export const PlaybackDepsContext = createContext<PlaybackDeps | null>(null);

/**
 * Connects the debate to the stage: turns that arrive while the page is open
 * are presented in order; earlier turns can be replayed on request.
 */
export function useStage(debate: DebateView | null, draft: LiveDraft | null) {
  const injected = useContext(PlaybackDepsContext);
  const [player] = useState(
    () => new StagePlayback({ savePrefs, ...(injected ?? browserPlaybackDeps()) }, readPrefs()),
  );
  const snapshot = useSyncExternalStore(player.subscribe, player.getSnapshot, player.getSnapshot);
  const seen = useRef<Set<string> | null>(null);
  const debateId = debate?.id;
  const messages = debate?.messages;
  const castKey = debate?.participants.map((p) => p.character.id).join() ?? '';
  const [mediaError, setMediaError] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => () => player.dispose(), [player]);

  // What each participant can be shown and heard with (resolved and validated on the server).
  useEffect(() => {
    if (!debateId || !castKey) return;
    let cancelled = false;
    void (injected?.api ?? mediaApi)
      .cast(debateId)
      .then(({ status, cast }) => {
        if (cancelled) return;
        player.setMedia(status, cast);
        setMediaError(false);
      })
      .catch(() => {
        if (!cancelled) setMediaError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [debateId, castKey, player, injected, reload]);

  // Present new character turns as they arrive.
  useEffect(() => {
    if (!messages || !debateId) return;
    // Turns already on the page when it opens are not replayed automatically.
    if (!seen.current) {
      seen.current = new Set(messages.map((m) => m.id));
      return;
    }
    for (const m of messages) {
      if (seen.current.has(m.id)) continue;
      seen.current.add(m.id);
      player.enqueue(debateId, m);
    }
  }, [messages, debateId, player]);

  const play = useCallback(
    (message: DebateMessage) => {
      if (debateId) player.playNow(debateId, message);
    },
    [debateId, player],
  );

  const attachVideo = useCallback(
    (el: HTMLVideoElement | null) => player.attachVideo(el),
    [player],
  );

  return {
    snapshot,
    attachVideo,
    states: player.states(debate?.participants ?? [], draft?.characterId),
    play,
    player,
    mediaError,
    reloadMedia: () => setReload((n) => n + 1),
  };
}

export type StageController = ReturnType<typeof useStage>;
