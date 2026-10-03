import type { DebateParticipant, Synthesis } from '@philax/types';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { SourceList } from '../sources/SourceList';

export function SynthesisView({
  synthesis,
  participants,
}: {
  synthesis: Synthesis;
  participants: Map<string, DebateParticipant>;
}) {
  const { t } = useTranslation();
  const name = (id: string) => participants.get(id)?.character.displayName ?? '';
  return (
    <section className="synthesis" aria-labelledby="synthesis-title">
      <h2 id="synthesis-title">{t('synthesis.title')}</h2>
      <p className="synthesis__note">{t('synthesis.noWinner')}</p>

      <h3>{t('synthesis.agree')}</h3>
      <ul>
        {synthesis.agreements.map((a) => (
          <li key={a.point}>
            {a.point}{' '}
            <span className="px-muted px-small">({a.participantIds.map(name).join(', ')})</span>
          </li>
        ))}
      </ul>

      <h3>{t('synthesis.disagree')}</h3>
      {synthesis.disagreements.map((d) => (
        <div key={d.point} className="disagreement">
          <p className="disagreement__point">
            <span className="axis-badge">{t(`synthesis.axes.${d.axis}`)}</span> {d.point}
          </p>
          <ul>
            {d.positions.map((p) => (
              <li key={p.characterId}>
                <strong>{name(p.characterId)}:</strong> {p.stance}
              </li>
            ))}
          </ul>
          <p>
            <strong>{t('synthesis.why')}:</strong> {d.whyTheyDisagree}
          </p>
        </div>
      ))}

      <h3>{t('synthesis.assumptions')}</h3>
      <ul>
        {synthesis.assumptions.map((a) => (
          <li key={a.characterId}>
            <strong>{name(a.characterId)}:</strong> {a.assumptions.join('; ')}
          </li>
        ))}
      </ul>

      <h3>{t('synthesis.keyArguments')}</h3>
      <ul>
        {synthesis.keyArguments.map((k) => (
          <li key={`${k.characterId}-${k.claim}`}>
            <strong>{name(k.characterId)}:</strong>{' '}
            {k.messageId ? <a href={`#msg-${k.messageId}`}>{k.claim}</a> : k.claim}
          </li>
        ))}
      </ul>

      <h3>{t('synthesis.unresolved')}</h3>
      <ul>
        {synthesis.unresolvedQuestions.map((q) => (
          <li key={q}>{q}</li>
        ))}
      </ul>
      <div className="strongest">
        <h3>{t('synthesis.strongest')}</h3>
        <p className="strongest__q">{synthesis.strongestUnresolvedQuestion}</p>
      </div>

      {synthesis.userPosition ? (
        <>
          <h3>{t('synthesis.userPosition')}</h3>
          <blockquote className="idea">{synthesis.userPosition}</blockquote>
        </>
      ) : null}

      <details className="panel">
        <summary className="panel__summary">
          {t('synthesis.sources')} ({synthesis.sources.length})
        </summary>
        <SourceList citations={synthesis.sources} scope="synthesis" />
      </details>

      <div className="what-do-you-think">
        <h3>{t('synthesis.whatDoYouThink')}</h3>
        <Link to="/challenge" className="px-btn px-btn--secondary">
          {t('synthesis.challengeCta')}
        </Link>
      </div>
    </section>
  );
}
