import type { DebateParticipant } from '@philax/types';
import { seatClass } from '@philax/ui';
import { useTranslation } from 'react-i18next';
import { CharacterAvatar } from '../stage/CharacterAvatar';
import { useCharacterPortrait } from '../stage/useCharacterPortrait';

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => /^\p{Lu}/u.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join('');
}

export function lifespan(birth: number | null, death: number | null): string {
  const y = (n: number) => (n < 0 ? `${-n} BCE` : String(n));
  if (death === null) return birth !== null ? `b. ${y(birth)}` : '';
  return `${birth !== null ? y(birth) : '?'}–${y(death)}`;
}

/** The character's portrait when a validated one exists, otherwise their initials. */
export function Avatar({ name, seat, slug }: { name: string; seat: number; slug?: string }) {
  const portrait = useCharacterPortrait(slug);
  if (portrait)
    return (
      <span className={`avatar avatar--portrait ${seatClass(seat)}`} aria-hidden="true">
        <CharacterAvatar {...portrait} state="IDLE" viseme="rest" animated={false} />
      </span>
    );
  return (
    <span className={`avatar ${seatClass(seat)}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function ParticipantCard({ participant }: { participant: DebateParticipant }) {
  const { t } = useTranslation();
  const c = participant.character;
  const noticeKey =
    c.representation === 'contemporary' ? 'debate.notice.contemporary' : 'debate.notice.historical';
  return (
    <li className={`participant ${seatClass(participant.seat)}`}>
      <div className="participant__head">
        <Avatar name={c.displayName} seat={participant.seat} slug={c.slug} />
        <div>
          <h3 className="participant__name">{c.displayName}</h3>
          <p className="px-m0 px-small px-muted">
            {lifespan(c.birthYear, c.deathYear)} · {c.era}
          </p>
        </div>
      </div>
      <p className="participant__perspective">
        <span className="px-visually-hidden">{t('debate.perspective')}: </span>
        {participant.perspective.label}
        {participant.role !== 'debater' ? (
          <span className="role-badge">{t(`debate.roles.${participant.role}`)}</span>
        ) : null}
      </p>
      <details className="participant__more">
        <summary>{t('debate.why')}</summary>
        <p>{participant.selectionReason}</p>
        <p className="px-muted px-small">{c.worldviewSummary}</p>
      </details>
      <p className="participant__notice px-small">{t(noticeKey, { name: c.displayName })}</p>
    </li>
  );
}
