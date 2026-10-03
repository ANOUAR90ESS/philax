import { captionAt, type AvatarState } from '@philax/media';
import type { DebateParticipant, DebateView, VoiceSpeed } from '@philax/types';
import { Button, seatClass } from '@philax/ui';
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import type { LiveDraft } from '../../hooks/useDebate';
import { initials } from '../characters/ParticipantCard';
import { CharacterAvatar } from './CharacterAvatar';
import type { MediaIssue } from './playback';
import { characterPortrait } from './useCharacterPortrait';
import type { StageController } from './useStage';

interface Props {
  debate: DebateView;
  draft: LiveDraft | null;
  stage: StageController;
}

function Portrait({
  participant,
  state,
  large,
  label,
}: {
  participant: DebateParticipant;
  state: AvatarState;
  large: boolean;
  label?: string;
}) {
  const { t } = useTranslation();
  const portrait = characterPortrait(participant.character.slug);
  if (!portrait) {
    // No validated likeness: a neutral monogram, never someone else's face.
    return (
      <span
        className={`portrait-missing ${large ? 'portrait-missing--large' : ''}`}
        role={label ? 'img' : undefined}
        aria-label={
          label ? t('stage.noAvatar', { name: participant.character.displayName }) : undefined
        }
        aria-hidden={label ? undefined : true}
      >
        {initials(participant.character.displayName)}
      </span>
    );
  }
  return (
    <CharacterAvatar {...portrait} state={state} size={large ? 'large' : 'small'} label={label} />
  );
}

const SPEEDS: VoiceSpeed[] = ['slow', 'normal', 'fast'];

/**
 * The debate as a scene: the whole cast is visible, the current speaker is in
 * focus (provider avatar, voice and subtitles, as the user chooses and the
 * character's configuration allows) and the others listen.
 */
export function DebateStage({ debate, draft, stage }: Props) {
  const { t } = useTranslation();
  const { snapshot, states, player, attachVideo } = stage;
  const { current, prefs, status } = snapshot;
  const focusId = current?.characterId ?? draft?.characterId ?? null;
  const focus = debate.participants.find((p) => p.character.id === focusId);
  const name = focus?.character.displayName ?? '';
  const state = focus ? (states[focus.character.id] ?? 'IDLE') : 'IDLE';
  const caption = current ? captionAt(current.segments, current.positionMs) : null;
  const segment = caption ? current?.segments[caption.segment] : undefined;
  const showVideo =
    current !== null &&
    (current.mode === 'live' || current.mode === 'video') &&
    current.phase !== 'loading' &&
    current.error === null;
  const notConfigured =
    status !== null &&
    (!status.voice.configured || (status.avatar.mode !== 'off' && !status.avatar.configured));

  if (!debate.participants.length) return null;

  const issueText = (issue: MediaIssue) =>
    t(`stage.issue.${issue.kind}`, {
      reason: t(`stage.reasons.${issue.reason}`),
    });

  return (
    <section className="stage" aria-label={t('stage.label')}>
      {status ? (
        <p className="stage__provider px-small px-muted" role="status">
          {notConfigured ? t('stage.providerNotConfigured') : t('stage.providerReady')}
          {notConfigured ? (
            <span className="stage__provider-detail">
              {' · '}
              {t('stage.providerDetail', {
                voice: status.voice.configured ? t('stage.configured') : t('stage.notConfigured'),
                avatar:
                  status.avatar.mode === 'off'
                    ? t('stage.off')
                    : status.avatar.configured
                      ? t('stage.configured')
                      : t('stage.notConfigured'),
              })}
            </span>
          ) : null}
        </p>
      ) : stage.mediaError ? (
        <p className="stage__provider px-small px-muted" role="status">
          {t('stage.mediaStatusFailed')}{' '}
          <Button variant="ghost" onClick={stage.reloadMedia}>
            {t('stage.retry')}
          </Button>
        </p>
      ) : null}

      <ul className="stage__cast" role="list">
        {debate.participants.map((p) => {
          const s = states[p.character.id] ?? 'IDLE';
          const active = p.character.id === focusId;
          return (
            <li
              key={p.character.id}
              className={`stage__seat ${seatClass(p.seat)} ${active ? 'is-active' : ''}`}
              aria-current={active ? 'true' : undefined}
            >
              <Portrait participant={p} state={s} large={false} />
              <span className="stage__seat-name">{p.character.displayName}</span>
              <span className="stage__seat-state">{t(`stage.states.${s}`)}</span>
            </li>
          );
        })}
      </ul>

      <div className={`stage__focus ${focus ? seatClass(focus.seat) : ''}`}>
        {focus ? (
          <p className="stage__now">
            {current ? t('stage.speaking') : t('stage.preparing')} <strong>{name}</strong>
            <span className="stage__role">
              {' · '}
              {focus.perspective.label}
              {focus.role !== 'debater' ? ` · ${t(`debate.roles.${focus.role}`)}` : ''}
            </span>
          </p>
        ) : (
          <p className="stage__idle px-muted">{t('stage.idle')}</p>
        )}

        {/* Provider avatar surface (real-time or rendered); always mounted so playback can attach. */}
        <video
          ref={attachVideo}
          className="stage__video"
          hidden={!showVideo}
          playsInline
          aria-label={focus ? t('stage.avatarLabel', { name }) : undefined}
        />
        {focus && !showVideo ? (
          <Portrait
            participant={focus}
            state={state}
            large
            label={t('stage.portraitLabel', { name })}
          />
        ) : null}
        {focus ? (
          <p className="stage__disclosure px-small">{t('stage.disclosure', { name })}</p>
        ) : null}
        {current?.phase === 'loading' ? (
          <p className="stage__loading px-small px-muted" role="status">
            {current.mode === 'live' || current.mode === 'video'
              ? t('stage.loadingAvatar')
              : t('stage.loadingVoice')}
          </p>
        ) : null}

        {prefs.captions && segment ? (
          <p className="stage__subtitles" dir="auto" lang={debate.language} aria-hidden="true">
            {segment.words.map((w, i) => (
              <Fragment key={`${segment.index}-${w.start}`}>
                <span className={i === caption?.word ? 'stage__word is-current' : 'stage__word'}>
                  {w.text}
                </span>{' '}
              </Fragment>
            ))}
          </p>
        ) : null}

        {current?.error ? (
          <p className="stage__error px-small" role="alert">
            {issueText(current.error)}{' '}
            <Button variant="ghost" onClick={() => player.retry()}>
              {t('stage.retry')}
            </Button>
          </p>
        ) : null}
        {current && !current.error
          ? current.notices.map((n) => (
              <p key={n.kind} className="stage__voice-note px-small px-muted">
                {issueText(n)}
              </p>
            ))
          : null}

        <div className="stage__controls" role="group" aria-label={t('stage.controls')}>
          <Button
            variant="ghost"
            aria-pressed={prefs.muted}
            onClick={() => player.setPrefs({ muted: !prefs.muted })}
          >
            {prefs.muted ? t('stage.unmute') : t('stage.mute')}
          </Button>
          {current?.phase === 'paused' ? (
            <Button variant="ghost" onClick={() => player.resume()}>
              {t('stage.resume')}
            </Button>
          ) : (
            <Button
              variant="ghost"
              onClick={() => player.pause()}
              disabled={current?.phase !== 'playing'}
            >
              {t('stage.pause')}
            </Button>
          )}
          <Button
            variant="ghost"
            aria-pressed={prefs.captions}
            onClick={() => player.setPrefs({ captions: !prefs.captions })}
          >
            {prefs.captions ? t('stage.captionsOff') : t('stage.captionsOn')}
          </Button>
          <Button
            variant="ghost"
            aria-pressed={prefs.avatar}
            onClick={() => player.setPrefs({ avatar: !prefs.avatar })}
          >
            {prefs.avatar ? t('stage.avatarOff') : t('stage.avatarOn')}
          </Button>
          <label className="stage__speed">
            <span>{t('stage.speed')}</span>
            <select
              value={prefs.speed}
              onChange={(e) => player.setPrefs({ speed: e.target.value as VoiceSpeed })}
            >
              {SPEEDS.map((s) => (
                <option key={s} value={s}>
                  {t(`stage.speeds.${s}`)}
                </option>
              ))}
            </select>
          </label>
          <Button variant="ghost" onClick={() => player.replay()} disabled={!snapshot.canReplay}>
            {t('stage.replay')}
          </Button>
          <Button variant="ghost" onClick={() => player.skip()} disabled={!current}>
            {t('stage.skip')}
          </Button>
        </div>
      </div>
    </section>
  );
}
