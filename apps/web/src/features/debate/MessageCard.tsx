import type { DebateMessage, DebateParticipant } from '@philax/types';
import { seatClass } from '@philax/ui';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../characters/ParticipantCard';
import { SourceList } from '../sources/SourceList';
import { SpeechText } from './SpeechText';

interface Props {
  message: DebateMessage;
  participants: Map<string, DebateParticipant>;
  messages: Map<string, DebateMessage>;
  onSourceOpen?: () => void;
  /** Language of the debate content (independent of the UI locale). */
  lang?: string;
  /** Replays the turn on the debate stage (voice, avatar and subtitles). */
  onListen?: (message: DebateMessage) => void;
}

export function speakerLabel(
  m: DebateMessage,
  participants: Map<string, DebateParticipant>,
  you: string,
): string {
  return m.speaker.type === 'user'
    ? you
    : (participants.get(m.speaker.characterId)?.character.displayName ?? '');
}

export function MessageCard({
  message,
  participants,
  messages,
  onSourceOpen,
  lang,
  onListen,
}: Props) {
  const { t } = useTranslation();
  const you = t('debate.you');
  const participant =
    message.speaker.type === 'character'
      ? participants.get(message.speaker.characterId)
      : undefined;
  const seat = participant?.seat ?? -1;
  const name = speakerLabel(message, participants, you);
  const replyTo = message.replyToMessageId ? messages.get(message.replyToMessageId) : undefined;
  const headingId = `msg-${message.id}-speaker`;
  return (
    <article
      id={`msg-${message.id}`}
      className={`message ${message.speaker.type === 'user' ? 'message--user' : seatClass(seat)}`}
      aria-labelledby={headingId}
    >
      <header className="message__head">
        {message.speaker.type === 'character' ? (
          <Avatar name={name} seat={seat} slug={participant?.character.slug} />
        ) : (
          <span className="avatar avatar--user" aria-hidden="true">
            ✦
          </span>
        )}
        <div>
          <h4 id={headingId} className="message__speaker">
            {name}
          </h4>
          <p className="px-m0 px-small px-muted">
            {t(`debate.moves.${message.move}`)}
            {replyTo ? (
              <>
                {' · '}
                <a href={`#msg-${replyTo.id}`}>
                  {t('debate.repliesTo', { name: speakerLabel(replyTo, participants, you) })}
                </a>
              </>
            ) : null}
          </p>
        </div>
        {onListen && message.speaker.type === 'character' ? (
          <button
            type="button"
            className="message__listen"
            onClick={() => onListen(message)}
            aria-label={t('stage.listenTo', { name })}
          >
            <span aria-hidden="true">▶</span> {t('stage.listen')}
          </button>
        ) : null}
      </header>
      {message.speaker.type === 'user' ? (
        <p className="speech" dir="auto">
          {message.content}
        </p>
      ) : (
        <SpeechText text={message.content} scope={message.id} lang={lang} />
      )}
      {message.argument ? (
        <details className="message__details">
          <summary>{t('debate.argument')}</summary>
          <dl className="argument" dir="auto" lang={lang}>
            <dt>{t('debate.claims')}</dt>
            <dd>{message.argument.claim}</dd>
            <dt>{t('debate.premises')}</dt>
            <dd>
              <ul>
                {message.argument.premises.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </dd>
            {message.argument.assumptions.length ? (
              <>
                <dt>{t('debate.assumptions')}</dt>
                <dd>
                  <ul>
                    {message.argument.assumptions.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </dd>
              </>
            ) : null}
            <dt>{t('debate.conclusion')}</dt>
            <dd>{message.argument.conclusion}</dd>
          </dl>
        </details>
      ) : null}
      {message.speaker.type === 'character' ? (
        <details
          className="message__details"
          open={message.citations.length > 0 && message.citations.length <= 2}
        >
          <summary>
            {t('sources.cited')} ({message.citations.length})
          </summary>
          <SourceList citations={message.citations} scope={message.id} onOpen={onSourceOpen} />
        </details>
      ) : null}
    </article>
  );
}
