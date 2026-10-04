import type { DebateView } from '@philax/types';
import { useState } from 'react';

/** The designed sets a debate can be staged in. */
export const SCENES = ['studio', 'library', 'agora', 'hall'] as const;
export type Scene = (typeof SCENES)[number];

const isScene = (v: unknown): v is Scene => SCENES.includes(v as Scene);

/**
 * The set that suits the debate: a debate hall when the user's own idea is
 * challenged, otherwise one that matches when the cast lived (an agora for
 * antiquity, a library up to the 19th century, a podcast studio after that).
 */
export function pickScene(debate: Pick<DebateView, 'mode' | 'participants'>): Scene {
  if (debate.mode === 'challenge') return 'hall';
  const years = debate.participants
    .map((p) => p.character.birthYear)
    .filter((y): y is number => typeof y === 'number')
    .sort((a, b) => a - b);
  if (!years.length) return 'studio';
  const median = years[Math.floor(years.length / 2)] ?? 0;
  if (median < 500) return 'agora';
  if (median < 1850) return 'library';
  return 'studio';
}

const key = (debateId: string) => `philax.stage.scene.${debateId}`;

function readChoice(debateId: string): Scene | null {
  try {
    const v = window.localStorage.getItem(key(debateId));
    return isScene(v) ? v : null;
  } catch {
    return null;
  }
}

/** The debate's set: picked automatically, or the one this viewer chose for it. */
export function useScene(debate: Pick<DebateView, 'id' | 'mode' | 'participants'>) {
  // The choice made on this page, for this debate; otherwise the one saved earlier.
  const [picked, setPicked] = useState<{ debateId: string; scene: Scene } | null>(null);
  const choice = picked?.debateId === debate.id ? picked.scene : readChoice(debate.id);

  const choose = (scene: Scene) => {
    setPicked({ debateId: debate.id, scene });
    try {
      window.localStorage.setItem(key(debate.id), scene);
    } catch {
      // Storage unavailable (private mode): the choice lasts for this page only.
    }
  };
  return [choice ?? pickScene(debate), choose] as const;
}
