import { writeFile } from 'node:fs/promises';
import { CHARACTER_STYLES, PRESENTATIONS, type Presentation } from '@philax/media';
import { isMediaProviderError } from './errors';
import type { ElevenLabsVoiceProvider } from './providers/elevenlabs';
import type { AssetAssignment, AvatarVendor, MediaProfileRepository } from './repository';
import type { CharacterMediaService } from './service';

export interface MediaCommandDeps {
  repository: MediaProfileRepository;
  service: CharacterMediaService;
  elevenlabs: ElevenLabsVoiceProvider;
  log: (line: string) => void;
}

const USAGE = `usage:
  media:sync                                   write identity briefs for every character
  media:configure <slug> [--presentation male|female|androgynous] [--voice <id>] [--voice-presentation male|female|androgynous]
                  [--voice-ar <id>] [--voice-es <id>] [--voice-en <id>]
                  [--live-avatar <id>] [--avatar <look id>] [--avatar-provider heygen|joggai]
                  [--avatar-presentation male|female|androgynous]
  media:verify                                 check every character against the live providers (read-only)
  media:design-voice <slug>                    design candidate voices with ElevenLabs (spends credits)
  media:design-voice <slug> --save <generated voice id>`;

function flags(args: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const v = args[i + 1];
    if (a?.startsWith('--') && v !== undefined && !v.startsWith('--')) {
      out.set(a.slice(2), v);
      i++;
    }
  }
  return out;
}

function presentation(value: string | undefined): Presentation | undefined {
  if (value === undefined) return undefined;
  if (!(PRESENTATIONS as readonly string[]).includes(value) || value === 'unknown')
    throw new Error(`Invalid presentation "${value}".`);
  return value as Presentation;
}

function avatarVendor(value: string | undefined): AvatarVendor {
  if (value !== 'heygen' && value !== 'joggai')
    throw new Error(`Invalid avatar provider "${value}".`);
  return value;
}

/** Operator commands for character media (run via `node dist/ops.js media:<command>`). */
export async function runMediaCommand(
  command: string,
  args: string[],
  deps: MediaCommandDeps,
): Promise<number> {
  const { repository, service, elevenlabs, log } = deps;
  switch (command) {
    case 'media:sync': {
      const written = await repository.syncBriefs(CHARACTER_STYLES);
      log(`[media] identity briefs written for ${written.length} characters`);
      return 0;
    }
    case 'media:configure': {
      const slug = args[0];
      if (!slug) break;
      const f = flags(args.slice(1));
      const languageVoices: Record<string, string> = {};
      for (const lang of ['en', 'es', 'ar']) {
        const v = f.get(`voice-${lang}`);
        if (v) languageVoices[lang] = v;
      }
      const assignment: AssetAssignment = {
        ...(f.has('voice') ? { voiceId: f.get('voice') } : {}),
        ...(f.has('live-avatar') ? { liveAvatarId: f.get('live-avatar') } : {}),
        ...(f.has('avatar') ? { avatarId: f.get('avatar') } : {}),
        ...(f.has('avatar-provider')
          ? { avatarProvider: avatarVendor(f.get('avatar-provider')) }
          : {}),
        ...(f.has('voice-presentation')
          ? { voicePresentation: presentation(f.get('voice-presentation')) }
          : {}),
        ...(f.has('avatar-presentation')
          ? { avatarPresentation: presentation(f.get('avatar-presentation')) }
          : {}),
        ...(Object.keys(languageVoices).length ? { languageVoices } : {}),
      };
      const recorded = presentation(f.get('presentation'));
      if (recorded && !(await repository.setPresentation(slug, recorded))) {
        log(`[media] no media profile for ${slug}; run media:sync first`);
        return 1;
      }
      let row;
      try {
        row = await repository.assign(slug, assignment);
      } catch (err) {
        if ((err as { code?: string }).code === '23505') {
          log(
            `[media] that asset is already assigned to another character; assets are never shared`,
          );
          return 1;
        }
        throw err;
      }
      if (!row) {
        log(`[media] no media profile for ${slug}; run media:sync first`);
        return 1;
      }
      log(`[media] ${slug} updated; run media:verify to check it against the providers`);
      return 0;
    }
    case 'media:verify': {
      const status = service.status();
      log(
        `[media] Provider status: voice ${status.voice.configured ? 'CONFIGURED' : 'NOT CONFIGURED'}, ` +
          `avatar (${status.avatar.mode}) ${status.avatar.configured ? 'CONFIGURED' : 'NOT CONFIGURED'}`,
      );
      let failures = 0;
      for (const row of await repository.list()) {
        for (const lang of ['en', 'es', 'ar']) {
          const { view } = await service.resolve({ id: row.characterId, slug: row.slug }, lang);
          const show = (a: typeof view.voice) => (a.status === 'ready' ? 'ready' : a.reason);
          if (view.voice.status !== 'ready' || view.avatar.status !== 'ready') failures++;
          log(`  ${row.slug} [${lang}] voice=${show(view.voice)} avatar=${show(view.avatar)}`);
        }
      }
      return failures ? 1 : 0;
    }
    case 'media:design-voice': {
      const slug = args[0];
      if (!slug) break;
      const brief = service.styles.resolve(slug);
      if (brief.status !== 'ready') {
        log(`[media] ${slug} has no valid identity brief`);
        return 1;
      }
      const { voiceIdentity: v, visualIdentity: vis } = brief.style;
      const f = flags(args.slice(1));
      const description =
        `A ${v.ageProfile ?? ''} ${v.presentation} speaker, ${v.tone}; ${v.pace} pace. ${v.speechStyle} ` +
        `Neutral studio recording. An original voice, not an imitation of any real person.`;
      const saveId = f.get('save');
      try {
        if (saveId) {
          const voiceId = await elevenlabs.saveDesignedVoice({
            name: `Philax · ${slug}`,
            description: description.slice(0, 1000),
            generatedVoiceId: saveId,
            labels: { gender: v.presentation, use_case: 'philax-character' },
          });
          await repository.assign(slug, { voiceId, voicePresentation: vis.presentation });
          log(`[media] saved voice ${voiceId} for ${slug}`);
          return 0;
        }
        const previews = await elevenlabs.designVoice({ description: description.slice(0, 1000) });
        for (const [i, p] of previews.entries()) {
          const file = `${slug}-preview-${i + 1}.mp3`;
          await writeFile(file, p.audio);
          log(`  ${file}  generated voice id: ${p.generatedVoiceId}`);
        }
        log(`[media] listen, then: media:design-voice ${slug} --save <generated voice id>`);
        return 0;
      } catch (err) {
        if (isMediaProviderError(err)) {
          log(`[media] ElevenLabs: ${err.code}`);
          return 1;
        }
        throw err;
      }
    }
  }
  log(USAGE);
  return 2;
}
