import { Alert, Button, Spinner } from '@philax/ui';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { debatesApi } from '../api/debates';
import { ErrorMessage } from '../components/ErrorMessage';
import { ParticipantCard } from '../features/characters/ParticipantCard';
import { ChallengePanel } from '../features/debate/ChallengePanel';
import { JoinDebate } from '../features/debate/JoinDebate';
import { PreparationProgress } from '../features/debate/PreparationProgress';
import { SynthesisView } from '../features/debate/SynthesisView';
import { Transcript } from '../features/debate/Transcript';
import { DebateStage } from '../features/stage/DebateStage';
import { useStage } from '../features/stage/useStage';
import { TopicPanel } from '../features/topic/TopicPanel';
import { isPreparing, useDebate } from '../hooks/useDebate';

export function DebatePage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    view,
    error,
    busy,
    steps,
    draft,
    liveRound,
    announcement,
    advance,
    sendMessage,
    setSaved,
    reload,
  } = useDebate(id);
  const stage = useStage(view, draft);

  useEffect(() => {
    if (view?.topic?.title) document.title = `${view.topic.title} · ${t('app.name')}`;
    return () => {
      document.title = t('app.name');
    };
  }, [view?.topic?.title, t]);

  if (!view) {
    return error ? (
      <div className="narrow stack">
        <ErrorMessage error={error} />
        <Link to="/">{t('debate.back')}</Link>
      </div>
    ) : (
      <Spinner label={t('debate.loading')} />
    );
  }

  const participants = new Map(view.participants.map((p) => [p.character.id, p]));
  const preparing = isPreparing(view);
  const roundsStarted = view.rounds.length > 0;
  const announceName = announcement;

  async function remove() {
    if (!window.confirm(t('debate.deleteConfirm'))) return;
    await debatesApi.remove(id);
    navigate('/me');
  }

  return (
    <div className="debate">
      <div className="px-visually-hidden" role="status" aria-live="polite">
        {announceName ? t('debate.finished', { name: announceName }) : ''}
      </div>

      <header className="debate__header">
        <p className="eyebrow">
          {t('debate.topic')} · {t(`debate.phases.${view.phase}`)}
        </p>
        <h1 dir="auto" lang={view.language}>
          {view.topic?.title ?? view.input.preview}
        </h1>
        {view.topic ? (
          <p className="lede" dir="auto" lang={view.language}>
            {view.topic.summary}
          </p>
        ) : null}
        {view.input.sourceUrl ? (
          <p className="px-small">
            <a href={view.input.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">
              {view.input.sourceUrl}
            </a>
          </p>
        ) : null}
        {roundsStarted || view.participants.length ? (
          <Alert tone="notice">
            <p className="px-m0 px-small">{t('debate.notice.general')}</p>
          </Alert>
        ) : null}
        {view.phase !== 'FAILED' && !preparing ? (
          <div className="debate__actions">
            <Button
              variant="ghost"
              onClick={() => void setSaved(!view.saved)}
              aria-pressed={view.saved}
            >
              {view.saved ? t('debate.saved') : t('debate.save')}
            </Button>
            <Button variant="danger" onClick={() => void remove()}>
              {t('debate.delete')}
            </Button>
          </div>
        ) : null}
      </header>

      {preparing ? <PreparationProgress steps={steps} /> : null}

      <DebateStage debate={view} draft={draft} stage={stage} />

      <div className="debate__layout">
        <aside className="debate__side" aria-label={t('debate.participants')}>
          {view.participants.length ? (
            <section aria-labelledby="participants-title">
              <h2 id="participants-title" className="section-title">
                {t('debate.participants')}
              </h2>
              <ul className="participants" role="list">
                {view.participants.map((p) => (
                  <ParticipantCard key={p.character.id} participant={p} />
                ))}
              </ul>
            </section>
          ) : null}
          <TopicPanel debate={view} />
        </aside>

        <div className="debate__main">
          {view.challenge ? <ChallengePanel challenge={view.challenge} /> : null}
          <Transcript
            debate={view}
            draft={draft}
            liveRound={liveRound}
            onSourceOpen={() => void debatesApi.trackSourceOpened(id).catch(() => undefined)}
            onListen={stage.play}
          />

          {error ? (
            <div className="stack">
              <ErrorMessage error={error} />
              {view.phase !== 'FAILED' ? (
                <div>
                  <Button variant="secondary" onClick={() => void reload()}>
                    {t('errors.retry')}
                  </Button>
                </div>
              ) : (
                <Link to="/">{t('debate.back')}</Link>
              )}
            </div>
          ) : null}

          {view.synthesis ? (
            <SynthesisView synthesis={view.synthesis} participants={participants} />
          ) : null}

          {!preparing && view.phase !== 'COMPLETED' && view.phase !== 'FAILED' ? (
            <div className="controls">
              {view.nextAction === 'advance' ? (
                <Button onClick={() => void advance()} busy={busy}>
                  {busy
                    ? t('debate.generating')
                    : roundsStarted
                      ? t('debate.next')
                      : t('debate.start')}
                </Button>
              ) : null}
              {view.nextAction === 'synthesize' ? (
                <Button onClick={() => void advance()} busy={busy}>
                  {busy ? t('debate.generating') : t('debate.toSynthesis')}
                </Button>
              ) : null}
              {view.phase === 'USER_CHALLENGE' ? (
                <p className="px-muted px-small">{t('debate.yourTurnHint')}</p>
              ) : null}
            </div>
          ) : null}

          {view.canUserJoin ? (
            <JoinDebate busy={busy} invite={view.phase === 'USER_CHALLENGE'} onSend={sendMessage} />
          ) : null}
          {view.phase === 'COMPLETED' ? <p className="px-muted">{t('debate.completed')}</p> : null}
        </div>
      </div>
    </div>
  );
}
