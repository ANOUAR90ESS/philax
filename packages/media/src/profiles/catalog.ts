import type {
  AvatarAppearance,
  CharacterStyle,
  CharacterVisualIdentity,
  CharacterVoiceIdentity,
  VoicePace,
} from '../identity/types';
import { MEDIA_LANGUAGES } from '../identity/types';

interface StyleInput {
  visual: Required<Omit<CharacterVisualIdentity, 'presentation'>> & {
    presentation: CharacterVisualIdentity['presentation'];
  };
  appearance: AvatarAppearance;
  voice: Omit<CharacterVoiceIdentity, 'languageProfiles'>;
  /** Delivery speed for the voice provider (ElevenLabs `speed`, 0.7–1.2). */
  speed: number;
}

/** Steadier delivery for slower, graver speakers; more variation for brisk ones. */
const STABILITY: Record<VoicePace, number> = {
  slow: 0.65,
  deliberate: 0.55,
  measured: 0.5,
  brisk: 0.4,
};

/**
 * Identity brief for one character: what the avatar and the voice must look and
 * sound like. Provider asset ids are configuration (database), not part of this.
 * `characterId` is the character's stable seed slug.
 */
export function defineStyle(slug: string, input: StyleInput): CharacterStyle {
  return {
    characterId: slug,
    visualIdentity: input.visual,
    voiceIdentity: { ...input.voice, languageProfiles: [...MEDIA_LANGUAGES] },
    portrait: input.appearance,
    voiceSettings: { speed: input.speed, stability: STABILITY[input.voice.pace], style: 0.3 },
    disclosure: 'ai_reconstruction',
  };
}

const SKIN = {
  fair: '#f2d6c2',
  light: '#efd0ba',
  warmLight: '#ecc9ad',
  olive: '#d6aa84',
  deepOlive: '#cfa07a',
  goldenBrown: '#e3c098',
  brown: '#8d5a3b',
} as const;

const NO_BEARD = { style: 'none', color: 'transparent' } as const;

/** Identity briefs for every seeded character. */
export const CHARACTER_STYLES: readonly CharacterStyle[] = [
  defineStyle('adam-smith', {
    visual: {
      presentation: 'male',
      approximateAge: 64,
      era: 'Scottish Enlightenment, 1780s',
      appearanceReference:
        'James Tassie paste medallion (1787): aquiline nose, full lips, powdered wig, clean-shaven.',
    },
    appearance: {
      skinTone: '#f0d2bb',
      faceShape: 'round',
      hair: { style: 'powdered-wig', color: '#ece9e2' },
      facialHair: NO_BEARD,
      glasses: 'none',
      headwear: 'none',
      attire: { style: '18c-coat', color: '#4a3b2f', accent: '#f3efe6' },
    },
    voice: {
      presentation: 'male',
      ageProfile: 'mature',
      tone: 'mild, courteous, observational',
      pace: 'measured',
      speechStyle: 'Plain Enlightenment prose that builds from everyday examples to principles.',
    },
    speed: 0.97,
  }),
  defineStyle('amartya-sen', {
    visual: {
      presentation: 'male',
      approximateAge: 80,
      era: 'Contemporary',
      appearanceReference:
        'Public photographs (2010s–2020s): full white hair, clean-shaven, open-collar shirt under a jacket.',
    },
    appearance: {
      skinTone: SKIN.brown,
      faceShape: 'oval',
      hair: { style: 'short', color: '#e3e0da' },
      facialHair: NO_BEARD,
      glasses: 'none',
      headwear: 'none',
      attire: { style: '20c-open-collar', color: '#5b6470', accent: '#d8d2c4' },
    },
    voice: {
      presentation: 'male',
      ageProfile: 'elder',
      tone: 'gentle, warm, precise',
      pace: 'measured',
      speechStyle: 'Courteous and exact; weighs plural reasons and capabilities.',
    },
    speed: 0.98,
  }),
  defineStyle('aristotle', {
    visual: {
      presentation: 'male',
      approximateAge: 60,
      era: 'Classical Greece, 4th century BCE',
      appearanceReference:
        'Roman marble copies of the Lysippos bronze: short trimmed beard, short hair over the brow, deep-set eyes.',
    },
    appearance: {
      skinTone: SKIN.olive,
      faceShape: 'square',
      hair: { style: 'short', color: '#8a8178' },
      facialHair: { style: 'short-beard', color: '#8a8178' },
      glasses: 'none',
      headwear: 'none',
      attire: { style: 'himation', color: '#d9cfbd', accent: '#9c7b4f' },
    },
    voice: {
      presentation: 'male',
      ageProfile: 'mature',
      tone: 'analytical, composed, systematic',
      pace: 'measured',
      speechStyle: 'Classifies and defines; moves from common opinion to first principles.',
    },
    speed: 1.0,
  }),
  defineStyle('confucius', {
    visual: {
      presentation: 'male',
      approximateAge: 70,
      era: 'Spring and Autumn period, China',
      appearanceReference:
        "No portrait from life survives. Follows the conventional depiction (attributed to Wu Daozi, Tang dynasty): long beard, scholar's cap, layered robe.",
    },
    appearance: {
      skinTone: SKIN.goldenBrown,
      faceShape: 'long',
      hair: { style: 'topknot', color: '#d8d4cc' },
      facialHair: { style: 'long-beard', color: '#d8d4cc' },
      glasses: 'none',
      headwear: 'scholar-cap',
      attire: { style: 'scholar-robe', color: '#3f4f5f', accent: '#c9a45c' },
    },
    voice: {
      presentation: 'male',
      ageProfile: 'elder',
      tone: 'calm, grave, kindly',
      pace: 'slow',
      speechStyle: 'Aphoristic and exemplary; teaches by question and maxim.',
    },
    speed: 0.86,
  }),
  defineStyle('david-hume', {
    visual: {
      presentation: 'male',
      approximateAge: 55,
      era: 'Scottish Enlightenment, 1760s',
      appearanceReference:
        'Allan Ramsay portrait (1766): broad face, double chin, white wig, scarlet coat with gold braid.',
    },
    appearance: {
      skinTone: '#efcdb4',
      faceShape: 'round',
      hair: { style: 'tied-wig', color: '#d9d3c7' },
      facialHair: NO_BEARD,
      glasses: 'none',
      headwear: 'none',
      attire: { style: '18c-coat', color: '#7a2e2e', accent: '#d9b25c' },
    },
    voice: {
      presentation: 'male',
      ageProfile: 'mature',
      tone: 'genial, ironic, unhurried',
      pace: 'measured',
      speechStyle: 'Sceptical and good-humoured; tests every claim against experience.',
    },
    speed: 0.96,
  }),
  defineStyle('epictetus', {
    visual: {
      presentation: 'male',
      approximateAge: 65,
      era: 'Roman Empire, early 2nd century',
      appearanceReference:
        'No likeness survives. Era-appropriate Stoic teacher with a plain cloak and beard; conjectural.',
    },
    appearance: {
      skinTone: SKIN.deepOlive,
      faceShape: 'long',
      hair: { style: 'balding', color: '#9a948b' },
      facialHair: { style: 'full-beard', color: '#9a948b' },
      glasses: 'none',
      headwear: 'none',
      attire: { style: 'himation', color: '#a89a80', accent: '#5f513d' },
    },
    voice: {
      presentation: 'male',
      ageProfile: 'elder',
      tone: 'stern, plain, bracing',
      pace: 'deliberate',
      speechStyle: 'Direct second-person exhortation with short, pointed questions.',
    },
    speed: 0.92,
  }),
  defineStyle('epicurus', {
    visual: {
      presentation: 'male',
      approximateAge: 55,
      era: 'Hellenistic Greece',
      appearanceReference:
        'Roman copies of a Hellenistic bust (Metropolitan Museum; Capitoline): full curled beard, furrowed brow.',
    },
    appearance: {
      skinTone: SKIN.olive,
      faceShape: 'oval',
      hair: { style: 'curly', color: '#5e5146' },
      facialHair: { style: 'full-beard', color: '#5e5146' },
      glasses: 'none',
      headwear: 'none',
      attire: { style: 'himation', color: '#e2d8c4', accent: '#7a8a6a' },
    },
    voice: {
      presentation: 'male',
      ageProfile: 'mature',
      tone: 'serene, friendly, reassuring',
      pace: 'measured',
      speechStyle: 'Calm and companionable; reasons toward tranquillity.',
    },
    speed: 0.95,
  }),
  defineStyle('friedrich-hayek', {
    visual: {
      presentation: 'male',
      approximateAge: 75,
      era: '20th century, 1970s',
      appearanceReference:
        'Photographs around the 1974 Nobel Prize: receding grey hair, small clipped moustache, three-piece suit.',
    },
    appearance: {
      skinTone: SKIN.light,
      faceShape: 'long',
      hair: { style: 'balding', color: '#bdb7ae' },
      facialHair: { style: 'mustache', color: '#bdb7ae' },
      glasses: 'none',
      headwear: 'none',
      attire: { style: '20c-suit', color: '#3b4250', accent: '#e9e6e0' },
    },
    voice: {
      presentation: 'male',
      ageProfile: 'elder',
      tone: 'courteous, careful, reserved',
      pace: 'deliberate',
      speechStyle: 'Patient, hedged exposition that stresses the limits of knowledge.',
    },
    speed: 0.92,
  }),
  defineStyle('friedrich-nietzsche', {
    visual: {
      presentation: 'male',
      approximateAge: 42,
      era: '19th-century Germany, 1880s',
      appearanceReference:
        'Photographs by Gustav Schultze (Naumburg, 1882): swept-back brown hair, heavy walrus moustache, dark frock coat.',
    },
    appearance: {
      skinTone: '#efcfb5',
      faceShape: 'oval',
      hair: { style: 'swept-back', color: '#6b4a2f' },
      facialHair: { style: 'walrus-mustache', color: '#6b4a2f' },
      glasses: 'none',
      headwear: 'none',
      attire: { style: '19c-frockcoat', color: '#2b2a2e', accent: '#e8e4dc' },
    },
    voice: {
      presentation: 'male',
      ageProfile: 'mature',
      tone: 'intense, philosophical, dramatic but controlled',
      pace: 'deliberate',
      speechStyle: 'Aphoristic and provocative; builds to emphatic declarations.',
    },
    speed: 0.9,
  }),
  defineStyle('fyodor-dostoevsky', {
    visual: {
      presentation: 'male',
      approximateAge: 50,
      era: '19th-century Russia, 1870s',
      appearanceReference:
        'Vasily Perov portrait (1872): high forehead, thinning hair, full reddish-brown beard, sunken eyes.',
    },
    appearance: {
      skinTone: '#e8c6aa',
      faceShape: 'long',
      hair: { style: 'receding', color: '#7a5a3c' },
      facialHair: { style: 'full-beard', color: '#7a5a3c' },
      glasses: 'none',
      headwear: 'none',
      attire: { style: '19c-frockcoat', color: '#3a3530', accent: '#d9d2c4' },
    },
    voice: {
      presentation: 'male',
      ageProfile: 'mature',
      tone: 'urgent, feverish, confessional',
      pace: 'brisk',
      speechStyle: 'Impassioned and searching; doubles back on its own objections.',
    },
    speed: 1.06,
  }),
  defineStyle('hannah-arendt', {
    visual: {
      presentation: 'female',
      approximateAge: 55,
      era: '20th century, 1950s–60s',
      appearanceReference:
        'Photographs from the 1950s–60s: dark wavy hair swept back, direct gaze, tailored dark clothing.',
    },
    appearance: {
      skinTone: '#efd0b9',
      faceShape: 'oval',
      hair: { style: 'wavy', color: '#3a2e28' },
      facialHair: NO_BEARD,
      glasses: 'none',
      headwear: 'none',
      attire: { style: '20c-blouse', color: '#2f3a45', accent: '#d8d3ca' },
    },
    voice: {
      presentation: 'female',
      ageProfile: 'mature',
      tone: 'calm, analytical, precise, intellectually serious',
      pace: 'measured',
      speechStyle: 'Draws careful distinctions in sober, exact formulations.',
    },
    speed: 0.97,
  }),
  defineStyle('immanuel-kant', {
    visual: {
      presentation: 'male',
      approximateAge: 66,
      era: 'German Enlightenment, 1790s',
      appearanceReference:
        'Portrait by Gottlieb Doebler (1791): slight build, narrow face, powdered hair, plain 18th-century coat.',
    },
    appearance: {
      skinTone: '#f0d4bf',
      faceShape: 'long',
      hair: { style: 'powdered-wig', color: '#e4e0d8' },
      facialHair: NO_BEARD,
      glasses: 'none',
      headwear: 'none',
      attire: { style: '18c-coat', color: '#6c6a5c', accent: '#f1ece2' },
    },
    voice: {
      presentation: 'male',
      ageProfile: 'elder',
      tone: 'dry, exact, methodical',
      pace: 'deliberate',
      speechStyle: 'Architectonic; defines terms and argues from necessary conditions.',
    },
    speed: 0.93,
  }),
  defineStyle('jean-jacques-rousseau', {
    visual: {
      presentation: 'male',
      approximateAge: 54,
      era: '18th-century Enlightenment, 1760s',
      appearanceReference:
        'Allan Ramsay portrait (1766): dark eyes, clean-shaven, Armenian fur cap and robe.',
    },
    appearance: {
      skinTone: SKIN.warmLight,
      faceShape: 'oval',
      hair: { style: 'short', color: '#5a4a3c' },
      facialHair: NO_BEARD,
      glasses: 'none',
      headwear: 'fur-cap',
      attire: { style: '18c-coat', color: '#5c4636', accent: '#e4dccf' },
    },
    voice: {
      presentation: 'male',
      ageProfile: 'mature',
      tone: 'passionate, sensitive, earnest',
      pace: 'measured',
      speechStyle: 'Eloquent and personal; contrasts natural goodness with social corruption.',
    },
    speed: 1.0,
  }),
  defineStyle('jean-paul-sartre', {
    visual: {
      presentation: 'male',
      approximateAge: 60,
      era: '20th-century France, 1960s',
      appearanceReference:
        'Photographs from the 1950s–60s: combed-back hair, thick round glasses, dark suit.',
    },
    appearance: {
      skinTone: '#eccbb1',
      faceShape: 'round',
      hair: { style: 'swept-back', color: '#7c766e' },
      facialHair: NO_BEARD,
      glasses: 'round-thick',
      headwear: 'none',
      attire: { style: '20c-suit', color: '#2d2d30', accent: '#cfcac2' },
    },
    voice: {
      presentation: 'male',
      ageProfile: 'mature',
      tone: 'rapid, combative, lucid',
      pace: 'brisk',
      speechStyle: 'Fast and polemical; presses on freedom and responsibility.',
    },
    speed: 1.1,
  }),
  defineStyle('john-locke', {
    visual: {
      presentation: 'male',
      approximateAge: 65,
      era: '17th-century England, 1690s',
      appearanceReference:
        'Godfrey Kneller portrait (1697): long face, own grey hair worn long, clean-shaven, dark clothing with white neckcloth.',
    },
    appearance: {
      skinTone: SKIN.warmLight,
      faceShape: 'long',
      hair: { style: 'long', color: '#cfc9be' },
      facialHair: NO_BEARD,
      glasses: 'none',
      headwear: 'none',
      attire: { style: 'periwig-coat', color: '#2f2a26', accent: '#efeae0' },
    },
    voice: {
      presentation: 'male',
      ageProfile: 'elder',
      tone: 'measured, sober, reasonable',
      pace: 'measured',
      speechStyle: 'Plain, careful argument from experience and consent.',
    },
    speed: 0.95,
  }),
  defineStyle('john-rawls', {
    visual: {
      presentation: 'male',
      approximateAge: 55,
      era: '20th-century United States, 1970s',
      appearanceReference:
        'Photographs from the 1970s–80s: short greying hair, clean-shaven, jacket and tie.',
    },
    appearance: {
      skinTone: SKIN.light,
      faceShape: 'long',
      hair: { style: 'short', color: '#8f8a82' },
      facialHair: NO_BEARD,
      glasses: 'none',
      headwear: 'none',
      attire: { style: '20c-suit', color: '#46505e', accent: '#e6e2da' },
    },
    voice: {
      presentation: 'male',
      ageProfile: 'mature',
      tone: 'gentle, careful, earnest',
      pace: 'measured',
      speechStyle: 'Methodical; invites the listener into thought experiments.',
    },
    speed: 0.95,
  }),
  defineStyle('john-stuart-mill', {
    visual: {
      presentation: 'male',
      approximateAge: 60,
      era: '19th-century Britain, 1860s',
      appearanceReference:
        'Photographs (London Stereoscopic Co., c. 1870) and G. F. Watts portrait (1873): bald crown, clean-shaven, dark frock coat.',
    },
    appearance: {
      skinTone: SKIN.light,
      faceShape: 'long',
      hair: { style: 'balding', color: '#8d8378' },
      facialHair: NO_BEARD,
      glasses: 'none',
      headwear: 'none',
      attire: { style: '19c-frockcoat', color: '#26262b', accent: '#ece7de' },
    },
    voice: {
      presentation: 'male',
      ageProfile: 'mature',
      tone: 'measured, earnest, lucid',
      pace: 'measured',
      speechStyle: 'Balanced and lucid; anticipates objections.',
    },
    speed: 1.0,
  }),
  defineStyle('karl-marx', {
    visual: {
      presentation: 'male',
      approximateAge: 57,
      era: '19th-century Europe, 1870s',
      appearanceReference:
        'Photograph by John Jabez Edwin Mayall (London, 1875): mane of grey hair, full white beard, dark frock coat.',
    },
    appearance: {
      skinTone: '#ecc8ac',
      faceShape: 'square',
      hair: { style: 'swept-back', color: '#cfcac2' },
      facialHair: { style: 'full-beard', color: '#d8d4cd' },
      glasses: 'none',
      headwear: 'none',
      attire: { style: '19c-frockcoat', color: '#2a2b30', accent: '#dcd6cc' },
    },
    voice: {
      presentation: 'male',
      ageProfile: 'mature',
      tone: 'firm, argumentative, confident',
      pace: 'measured',
      speechStyle: 'Polemical and historical; names material interests and contradictions.',
    },
    speed: 1.02,
  }),
  defineStyle('karl-popper', {
    visual: {
      presentation: 'male',
      approximateAge: 80,
      era: '20th century, 1980s',
      appearanceReference:
        'Photographs from the 1980s–90s: bald crown with white hair at the sides, clean-shaven, tweed jacket.',
    },
    appearance: {
      skinTone: SKIN.light,
      faceShape: 'long',
      hair: { style: 'balding', color: '#e2ded7' },
      facialHair: NO_BEARD,
      glasses: 'none',
      headwear: 'none',
      attire: { style: '20c-suit', color: '#5b5248', accent: '#d9e0e6' },
    },
    voice: {
      presentation: 'male',
      ageProfile: 'elder',
      tone: 'incisive, emphatic, combative',
      pace: 'measured',
      speechStyle: 'Sharp and critical; seeks the refutation, not the confirmation.',
    },
    speed: 1.03,
  }),
  defineStyle('martin-heidegger', {
    visual: {
      presentation: 'male',
      approximateAge: 70,
      era: '20th-century Germany, 1960s',
      appearanceReference:
        'Photographs from the 1960s (Digne Meller-Marcovicz, 1966–68): short grey hair, small moustache, traditional Black Forest jacket.',
    },
    appearance: {
      skinTone: '#ebcbb0',
      faceShape: 'square',
      hair: { style: 'short', color: '#bab4ab' },
      facialHair: { style: 'mustache', color: '#bab4ab' },
      glasses: 'none',
      headwear: 'none',
      attire: { style: 'loden-jacket', color: '#4b5340', accent: '#d6cfbf' },
    },
    voice: {
      presentation: 'male',
      ageProfile: 'elder',
      tone: 'slow, dense, solemn',
      pace: 'slow',
      speechStyle: 'Etymological and circling; returns to the question of Being.',
    },
    speed: 0.86,
  }),
  defineStyle('mary-wollstonecraft', {
    visual: {
      presentation: 'female',
      approximateAge: 38,
      era: '18th-century Britain, 1790s',
      appearanceReference:
        'John Opie portrait (c. 1797): auburn hair loosely curled, white muslin gown.',
    },
    appearance: {
      skinTone: SKIN.fair,
      faceShape: 'oval',
      hair: { style: 'loose-curls', color: '#8a4b2a' },
      facialHair: NO_BEARD,
      glasses: 'none',
      headwear: 'none',
      attire: { style: 'regency-gown', color: '#efe9df', accent: '#7d8b6a' },
    },
    voice: {
      presentation: 'female',
      ageProfile: 'adult',
      tone: 'spirited, direct, reasoned',
      pace: 'brisk',
      speechStyle: 'Forthright moral argument that appeals to reason and rights.',
    },
    speed: 1.05,
  }),
  defineStyle('peter-singer', {
    visual: {
      presentation: 'male',
      approximateAge: 75,
      era: 'Contemporary',
      appearanceReference:
        'Public photographs (2010s–2020s): receding grey hair, clean-shaven, open-collar shirt.',
    },
    appearance: {
      skinTone: SKIN.light,
      faceShape: 'oval',
      hair: { style: 'balding', color: '#b9b4ac' },
      facialHair: NO_BEARD,
      glasses: 'none',
      headwear: 'none',
      attire: { style: '20c-open-collar', color: '#56606b', accent: '#e7e4dd' },
    },
    voice: {
      presentation: 'male',
      ageProfile: 'elder',
      tone: 'calm, plain-spoken, persistent',
      pace: 'measured',
      speechStyle: 'Plain and consequence-focused; reasons through concrete cases.',
    },
    speed: 1.0,
  }),
  defineStyle('plato', {
    visual: {
      presentation: 'male',
      approximateAge: 60,
      era: 'Classical Athens, 4th century BCE',
      appearanceReference:
        'Roman copies of the Silanion portrait (c. 370 BCE): full beard, broad brow, hair bound with a fillet.',
    },
    appearance: {
      skinTone: '#d9ad86',
      faceShape: 'square',
      hair: { style: 'short', color: '#cfc9bf' },
      facialHair: { style: 'full-beard', color: '#cfc9bf' },
      glasses: 'none',
      headwear: 'none',
      attire: { style: 'himation', color: '#ece4d2', accent: '#7d6a96' },
    },
    voice: {
      presentation: 'male',
      ageProfile: 'mature',
      tone: 'elevated, probing, ironic',
      pace: 'measured',
      speechStyle: 'Dialogical; leads by questions toward definitions and forms.',
    },
    speed: 0.98,
  }),
  defineStyle('robert-nozick', {
    visual: {
      presentation: 'male',
      approximateAge: 40,
      era: '20th-century United States, 1970s',
      appearanceReference:
        'Photographs from the 1970s: dark curly hair, clean-shaven, open-collar shirt.',
    },
    appearance: {
      skinTone: '#efceb5',
      faceShape: 'oval',
      hair: { style: 'curly', color: '#2e241e' },
      facialHair: NO_BEARD,
      glasses: 'none',
      headwear: 'none',
      attire: { style: '20c-open-collar', color: '#6b5a4a', accent: '#efe9dd' },
    },
    voice: {
      presentation: 'male',
      ageProfile: 'mature',
      tone: 'quick, witty, playful',
      pace: 'brisk',
      speechStyle: 'Inventive thought experiments and quick counterexamples.',
    },
    speed: 1.08,
  }),
  defineStyle('sigmund-freud', {
    visual: {
      presentation: 'male',
      approximateAge: 65,
      era: 'Interwar Vienna, 1920s',
      appearanceReference:
        'Photographs by Max Halberstadt (1921): short grey hair, trimmed grey beard and moustache, three-piece suit.',
    },
    appearance: {
      skinTone: SKIN.warmLight,
      faceShape: 'oval',
      hair: { style: 'short', color: '#9c958b' },
      facialHair: { style: 'short-beard', color: '#a8a197' },
      glasses: 'none',
      headwear: 'none',
      attire: { style: '20c-suit', color: '#3a3631', accent: '#e6e1d8' },
    },
    voice: {
      presentation: 'male',
      ageProfile: 'elder',
      tone: 'measured, clinical, authoritative',
      pace: 'deliberate',
      speechStyle: 'Case-based and interpretive; uncovers hidden motives.',
    },
    speed: 0.94,
  }),
  defineStyle('simone-de-beauvoir', {
    visual: {
      presentation: 'female',
      approximateAge: 45,
      era: '20th-century France, 1950s',
      appearanceReference:
        'Photographs from the 1940s–50s: dark hair drawn up into her characteristic turban, blouse and cardigan.',
    },
    appearance: {
      skinTone: '#f0d2bd',
      faceShape: 'oval',
      hair: { style: 'updo', color: '#3b2a20' },
      facialHair: NO_BEARD,
      glasses: 'none',
      headwear: 'turban',
      attire: { style: '20c-blouse', color: '#7a3b3b', accent: '#efe8de' },
    },
    voice: {
      presentation: 'female',
      ageProfile: 'mature',
      tone: 'lucid, brisk, incisive',
      pace: 'brisk',
      speechStyle: 'Rapid and concrete; grounds abstractions in lived situations.',
    },
    speed: 1.1,
  }),
  defineStyle('soren-kierkegaard', {
    visual: {
      presentation: 'male',
      approximateAge: 30,
      era: '19th-century Denmark, 1840s',
      appearanceReference:
        'Sketch by Niels Christian Kierkegaard (c. 1840): tall swept-up hair, thin face, high collar and cravat.',
    },
    appearance: {
      skinTone: SKIN.fair,
      faceShape: 'long',
      hair: { style: 'quiff', color: '#6a4c33' },
      facialHair: NO_BEARD,
      glasses: 'none',
      headwear: 'none',
      attire: { style: '19c-frockcoat', color: '#2e3440', accent: '#efe9df' },
    },
    voice: {
      presentation: 'male',
      ageProfile: 'adult',
      tone: 'ironic, intense, inward',
      pace: 'measured',
      speechStyle: 'Ironic and indirect; addresses the single individual.',
    },
    speed: 1.02,
  }),
  defineStyle('thomas-hobbes', {
    visual: {
      presentation: 'male',
      approximateAge: 80,
      era: '17th-century England, 1660s',
      appearanceReference:
        'John Michael Wright portrait (c. 1669–70): long white hair, moustache and small chin tuft, dark clothes with a plain white collar.',
    },
    appearance: {
      skinTone: '#eac7ad',
      faceShape: 'long',
      hair: { style: 'long', color: '#eceae5' },
      facialHair: { style: 'mustache-tuft', color: '#eceae5' },
      glasses: 'none',
      headwear: 'none',
      attire: { style: 'puritan-collar', color: '#1f1d1c', accent: '#f2eee6' },
    },
    voice: {
      presentation: 'male',
      ageProfile: 'elder',
      tone: 'blunt, dry, sardonic',
      pace: 'measured',
      speechStyle: 'Blunt definitions and stark, mechanistic conclusions.',
    },
    speed: 0.97,
  }),
  defineStyle('thomas-kuhn', {
    visual: {
      presentation: 'male',
      approximateAge: 50,
      era: '20th-century United States, 1970s',
      appearanceReference:
        'Photographs from the 1970s: receding dark hair, horn-rimmed glasses, jacket and tie.',
    },
    appearance: {
      skinTone: '#efcfb7',
      faceShape: 'round',
      hair: { style: 'receding', color: '#4a3b30' },
      facialHair: NO_BEARD,
      glasses: 'rectangular',
      headwear: 'none',
      attire: { style: '20c-suit', color: '#5a5246', accent: '#e3ddd2' },
    },
    voice: {
      presentation: 'male',
      ageProfile: 'mature',
      tone: 'careful, exploratory, earnest',
      pace: 'measured',
      speechStyle: 'Historical case studies with careful qualifications.',
    },
    speed: 0.99,
  }),
];
