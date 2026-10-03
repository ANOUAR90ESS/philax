import type { AvatarAppearance, Presentation } from '@philax/media';
import { useEffect, useState } from 'react';
import { useMediaServices } from './media-services';

export interface CharacterPortrait {
  appearance: AvatarAppearance;
  presentation: Presentation;
  age: number;
}

/** A character's validated portrait, or null when none may be shown. */
export function useCharacterPortrait(slug: string | undefined): CharacterPortrait | null {
  const services = useMediaServices();
  const [portrait, setPortrait] = useState<{ slug: string; value: CharacterPortrait } | null>(null);
  useEffect(() => {
    if (!slug) return;
    const media = services.registry.resolve(slug);
    if (media.status !== 'ready') return;
    let cancelled = false;
    void services.avatars.avatarFor(media).then((outcome) => {
      if (cancelled || outcome.status !== 'ready' || !outcome.avatar.appearance) return;
      setPortrait({
        slug,
        value: {
          appearance: outcome.avatar.appearance,
          presentation: outcome.avatar.presentation,
          age: media.profile.visualIdentity.approximateAge ?? 50,
        },
      });
    });
    return () => {
      cancelled = true;
    };
  }, [slug, services]);
  return portrait && portrait.slug === slug ? portrait.value : null;
}
