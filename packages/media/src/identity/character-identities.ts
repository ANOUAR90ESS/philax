import type { CharacterIdentity, LikenessEvidence, Presentation } from './types';

function id(
  characterSlug: string,
  presentation: Presentation,
  likeness: LikenessEvidence,
  presentationBasis = 'Documented throughout the biographical and historical record.',
): CharacterIdentity {
  return { characterSlug, presentation, presentationBasis, likeness };
}

/**
 * Canonical identities of the seeded characters. Media profiles are checked
 * against these records, never the other way round.
 */
export const CHARACTER_IDENTITIES: readonly CharacterIdentity[] = [
  id('adam-smith', 'male', 'portrait'),
  id('amartya-sen', 'male', 'photographic'),
  id('aristotle', 'male', 'portrait', 'Ancient biographies (Diogenes Laërtius) and his own works.'),
  id('confucius', 'male', 'traditional', 'The Analects and the Records of the Grand Historian.'),
  id('david-hume', 'male', 'portrait'),
  id('epictetus', 'male', 'conjectural', "Arrian's Discourses and ancient testimony."),
  id('epicurus', 'male', 'portrait', 'Diogenes Laërtius and surviving letters.'),
  id('friedrich-hayek', 'male', 'photographic'),
  id('friedrich-nietzsche', 'male', 'photographic'),
  id('fyodor-dostoevsky', 'male', 'photographic'),
  id('hannah-arendt', 'female', 'photographic'),
  id('immanuel-kant', 'male', 'portrait'),
  id('jean-jacques-rousseau', 'male', 'portrait'),
  id('jean-paul-sartre', 'male', 'photographic'),
  id('john-locke', 'male', 'portrait'),
  id('john-rawls', 'male', 'photographic'),
  id('john-stuart-mill', 'male', 'photographic'),
  id('karl-marx', 'male', 'photographic'),
  id('karl-popper', 'male', 'photographic'),
  id('martin-heidegger', 'male', 'photographic'),
  id('mary-wollstonecraft', 'female', 'portrait'),
  id('peter-singer', 'male', 'photographic'),
  id('plato', 'male', 'portrait', 'Ancient biographies and the dialogues.'),
  id('robert-nozick', 'male', 'photographic'),
  id('sigmund-freud', 'male', 'photographic'),
  id('simone-de-beauvoir', 'female', 'photographic'),
  id('soren-kierkegaard', 'male', 'portrait'),
  id('thomas-hobbes', 'male', 'portrait'),
  id('thomas-kuhn', 'male', 'photographic'),
];
