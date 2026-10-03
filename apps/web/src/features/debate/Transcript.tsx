import type { DebateMessage, DebateParticipant, DebateRound, DebateView } from '@philax/types';
import { useTranslation } from 'react-i18next';
import type { LiveDraft } from '../../hooks/useDebate';
import { LiveDraftCard } from './LiveDraftCard';
import { MessageCard } from './MessageCard';

interface Props {
  debate: DebateView;
  draft: LiveDraft | null;
  liveRound: DebateRound | null;
  onSourceOpen?: () => void;
}

export function Transcript({ debate, draft, liveRound, onSourceOpen }: Props) {
  const { t } = useTranslation();
  const participants = new Map<string, DebateParticipant>(
    debate.participants.map((p) => [p.character.id, p]),
  );
  const messages = new Map<string, DebateMessage>(debate.messages.map((m) => [m.id, m]));
  const rounds: DebateRound[] = [...debate.rounds];
  if (liveRound && !rounds.some((r) => r.number === liveRound.number)) rounds.push(liveRound);
  rounds.sort((a, b) => a.number - b.number);
  const mainTotal = debate.plannedRounds;

  if (rounds.length === 0) return <p className="px-muted">{t('debate.transcriptEmpty')}</p>;

  let mainIndex = 0;
  return (
    <section aria-label={t('debate.transcript')} className="transcript">
      {rounds.map((round, i) => {
        const isMain = round.phase !== 'USER_EXCHANGE';
        if (isMain) mainIndex++;
        const roundMessages = debate.messages.filter((m) => m.roundNumber === round.number);
        const isLast = i === rounds.length - 1;
        return (
          <section
            key={round.number}
            className={`round round--${round.phase.toLowerCase()}`}
            aria-labelledby={`round-${round.number}`}
          >
            <h3 id={`round-${round.number}`} className="round__title">
              {isMain ? (
                <span className="round__number">
                  {t('debate.roundOf', {
                    number: mainIndex,
                    total: Math.max(mainTotal, mainIndex),
                  })}
                </span>
              ) : null}
              <span>{t(`debate.phases.${round.phase}`)}</span>
            </h3>
            {roundMessages.map((m) => (
              <MessageCard
                key={m.id}
                message={m}
                participants={participants}
                messages={messages}
                onSourceOpen={onSourceOpen}
                lang={debate.language}
              />
            ))}
            {draft && isLast ? (
              <LiveDraftCard draft={draft} participant={participants.get(draft.characterId)} />
            ) : null}
          </section>
        );
      })}
    </section>
  );
}
