const KEY = 'philax.pendingInput';

/** Keeps an unsent draft across the sign-in redirect (per-tab, never sent anywhere). */
export function savePendingInput(kind: 'debate' | 'challenge', value: string): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ kind, value }));
  } catch {
    // Storage unavailable: the draft is simply not restored.
  }
}

export function takePendingInput(kind: 'debate' | 'challenge'): string | undefined {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { kind?: string; value?: string };
    if (parsed.kind !== kind) return undefined;
    sessionStorage.removeItem(KEY);
    return typeof parsed.value === 'string' ? parsed.value : undefined;
  } catch {
    return undefined;
  }
}
