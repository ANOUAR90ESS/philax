import { PREPARATION_STEPS } from '@philax/types';
import { useTranslation } from 'react-i18next';
import type { StepStatus } from '../../hooks/useDebate';

export function PreparationProgress({ steps }: { steps: StepStatus }) {
  const { t } = useTranslation();
  return (
    <section className="prep" aria-labelledby="prep-title">
      <h2 id="prep-title">{t('pipeline.title')}</h2>
      <ol className="prep__steps" aria-live="polite">
        {PREPARATION_STEPS.map((s) => {
          const status = steps[s];
          return (
            <li key={s} className={`prep__step prep__step--${status ?? 'pending'}`}>
              <span className="prep__icon" aria-hidden="true">
                {status === 'completed' ? '✓' : status === 'started' ? '…' : '○'}
              </span>
              {t(`pipeline.steps.${s}`)}
            </li>
          );
        })}
      </ol>
      <p className="px-muted px-small">{t('pipeline.slow')}</p>
    </section>
  );
}
