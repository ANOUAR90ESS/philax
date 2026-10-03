import type { DebateView } from '@philax/types';
import { useTranslation } from 'react-i18next';

export function TopicPanel({ debate }: { debate: DebateView }) {
  const { t } = useTranslation();
  const topic = debate.topic;
  if (!topic) return null;
  return (
    <details className="panel">
      <summary className="panel__summary">{t('debate.analysis')}</summary>
      <div className="stack panel__body">
        <section>
          <h3>{t('debate.claims')}</h3>
          <ul className="claims">
            {topic.claims.map((c) => (
              <li key={c.id}>
                <span className={`claim-kind claim-kind--${c.kind}`}>
                  {t(`claimKinds.${c.kind}`)}
                </span>{' '}
                {c.text}
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3>{t('debate.questions')}</h3>
          <ul>
            {topic.questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </section>
        {debate.disagreementAxes.length ? (
          <section>
            <h3>{t('debate.axes')}</h3>
            <ul>
              {debate.disagreementAxes.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </details>
  );
}
