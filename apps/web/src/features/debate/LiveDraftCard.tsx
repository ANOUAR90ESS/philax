import type { DebateParticipant } from '@philax/types';
import { seatClass } from '@philax/ui';
import { useTranslation } from 'react-i18next';
import type { LiveDraft } from '../../hooks/useDebate';
import { Avatar } from '../characters/ParticipantCard';

/**
 * The speech being generated. Not announced token by token to screen readers
 * (aria-live is off); completion is announced by the page's live region.
 */
export function LiveDraftCard({
  draft,
  participant,
}: {
  draft: LiveDraft;
  participant: DebateParticipant | undefined;
}) {
  const { t } = useTranslation();
  const name = participant?.character.displayName ?? '';
  return (
    <article
      className={`message message--draft ${seatClass(participant?.seat ?? 0)}`}
      aria-busy="true"
    >
      <header className="message__head">
        <Avatar name={name} seat={participant?.seat ?? 0} slug={participant?.character.slug} />
        <div>
          <h4 className="message__speaker">{name}</h4>
          <p className="px-m0 px-small px-muted">
            {draft.revising ? t('debate.revising') : t('debate.speaking', { name })}
          </p>
        </div>
      </header>
      <p className="speech speech--draft" aria-live="off" dir="auto">
        {draft.text}
        <span className="caret" aria-hidden="true" />
      </p>
    </article>
  );
}
