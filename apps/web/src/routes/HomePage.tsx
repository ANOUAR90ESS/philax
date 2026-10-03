import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { debatesApi } from '../api/debates';
import { useAuth } from '../app/AuthProvider';
import { detectInput } from '../features/input/detect-input';
import { IdeaForm } from '../features/input/IdeaForm';
import { isLocale } from '../lib/i18n';
import { savePendingInput, takePendingInput } from '../lib/pending-input';

export function HomePage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [initial] = useState(() => takePendingInput('debate'));
  const [formKey, setFormKey] = useState(0);
  const [prefill, setPrefill] = useState(initial);
  const examples = t('home.examples', { returnObjects: true }) as string[];
  const steps = t('home.how', { returnObjects: true }) as string[];

  async function start(value: string) {
    if (!user) {
      savePendingInput('debate', value);
      navigate('/signin', { state: { from: '/' } });
      return;
    }
    const { debate } = await debatesApi.create({
      input: detectInput(value),
      locale: isLocale(i18n.language) ? i18n.language : undefined,
    });
    navigate(`/debates/${debate.id}`);
  }

  return (
    <div className="home stack-lg">
      <section className="hero stack" aria-labelledby="home-title">
        <h1 id="home-title" className="hero__title">
          {t('home.heading')}
        </h1>
        <IdeaForm
          key={formKey}
          label={t('home.inputLabel')}
          placeholder={t('home.inputLabel')}
          hint={t('home.hint')}
          submitLabel={t('home.start')}
          initialValue={prefill}
          onSubmit={start}
        />
      </section>
      <section aria-labelledby="examples-title" className="stack">
        <h2 id="examples-title" className="section-title">
          {t('home.examplesTitle')}
        </h2>
        <ul className="chips" role="list">
          {examples.map((ex) => (
            <li key={ex}>
              <button
                type="button"
                className="chip"
                onClick={() => {
                  setPrefill(ex);
                  setFormKey((k) => k + 1);
                }}
              >
                {ex}
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="how-title" className="stack">
        <h2 id="how-title" className="section-title">
          {t('home.howTitle')}
        </h2>
        <ol className="how">
          {steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </section>
    </div>
  );
}
