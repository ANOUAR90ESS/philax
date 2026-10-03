import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { debatesApi } from '../api/debates';
import { useAuth } from '../app/AuthProvider';
import { IdeaForm } from '../features/input/IdeaForm';
import { isLocale } from '../lib/i18n';
import { savePendingInput, takePendingInput } from '../lib/pending-input';

export function ChallengePage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [initial] = useState(() => takePendingInput('challenge'));

  async function start(value: string) {
    if (!user) {
      savePendingInput('challenge', value);
      navigate('/signin', { state: { from: '/challenge' } });
      return;
    }
    const { debate } = await debatesApi.createChallenge({
      idea: value.trim(),
      locale: isLocale(i18n.language) ? i18n.language : undefined,
    });
    navigate(`/debates/${debate.id}`);
  }

  return (
    <section className="hero stack narrow" aria-labelledby="challenge-title">
      <h1 id="challenge-title" className="hero__title">
        {t('challenge.heading')}
      </h1>
      <p className="lede">{t('challenge.intro')}</p>
      <IdeaForm
        label={t('challenge.label')}
        placeholder={t('challenge.placeholder')}
        submitLabel={t('challenge.start')}
        initialValue={initial}
        maxLength={2000}
        detectUrls={false}
        onSubmit={start}
      />
    </section>
  );
}
