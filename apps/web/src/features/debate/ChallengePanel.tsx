import type { ChallengeFraming } from '@philax/types';
import { useTranslation } from 'react-i18next';

export function ChallengePanel({ challenge }: { challenge: ChallengeFraming }) {
  const { t } = useTranslation();
  return (
    <section className="challenge-panel" aria-labelledby="challenge-title">
      <h2 id="challenge-title">{t('debate.challengeFraming.title')}</h2>
      <blockquote className="idea">{challenge.idea}</blockquote>
      <h3>{t('debate.challengeFraming.hidden')}</h3>
      <ul>
        {challenge.hiddenAssumptions.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
      <h3>{t('debate.challengeFraming.strongest')}</h3>
      <p>{challenge.strongestObjection}</p>
    </section>
  );
}
