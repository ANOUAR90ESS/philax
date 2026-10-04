import { captionAt, type AvatarState } from '@philax/media';
import type { DebateParticipant, DebateView, VoiceSpeed } from '@philax/types';
import { Button, seatClass } from '@philax/ui';
import { Fragment, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { LiveDraft } from '../../hooks/useDebate';
import { initials } from '../characters/ParticipantCard';
import { CharacterAvatar } from './CharacterAvatar';
import { SceneBackdrop } from './SceneBackdrop';
import { SCENES, useScene, type Scene } from './scenes';
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

/** Safari (WebKit) plays WebM without its alpha channel, so a cut-out speaker needs a frame there. */
function rendersVideoAlpha(): boolean {
  if (typeof navigator === 'undefined') return true;
  const ua = navigator.userAgent;
  return !(/Safari\//.test(ua) && !/(Chrome|Chromium|CriOS|FxiOS|Edg|Android)\//.test(ua));
}

/**
 * The debate as one shared scene, like a recorded podcast: the whole cast sits
 * together on a designed set, the current speaker is lit and in focus (provider
 * avatar, voice and subtitles, as the user chooses and the character's
 * configuration allows) and the others listen and react from their seats.
 */
export function DebateStage({ debate, draft, stage }: Props) {
  const { t } = useTranslation();
  const { snapshot, states, player, attachVideo } = stage;
  const { current, prefs } = snapshot;
  const focusId = current?.characterId ?? draft?.characterId ?? null;
  const focus = debate.participants.find((p) => p.character.id === focusId);
  const name = focus?.character.displayName ?? '';
  const caption = current ? captionAt(current.segments, current.positionMs) : null;
  const segment = caption ? current?.segments[caption.segment] : undefined;
  const [scene, chooseScene] = useScene(debate);
  const focusIndex = debate.participants.findIndex((p) => p.character.id === focusId);
  // Centre of the speaker's seat, as a share of the set's width (seats are equal columns).
  const focusX = focusIndex < 0 ? 50 : ((focusIndex + 0.5) / debate.participants.length) * 100;
  const showVideo =
    current !== null &&
    (current.mode === 'live' || current.mode === 'video') &&
    current.phase !== 'loading' &&
    current.error === null;
  // A transparent rendered speaker stands in the set; otherwise the video is framed over the seat.
  const cutout =
    current?.mode === 'video' &&
    snapshot.status?.avatar.presentation === 'cutout' &&
    rendersVideoAlpha();

  if (!debate.participants.length) return null;

  const issueText = (issue: MediaIssue) =>
    t(`stage.issue.${issue.kind}`, {
      reason: t(`stage.reasons.${issue.reason}`),
    });

  return (
    <section className="stage" aria-label={t('stage.label')}>
      {stage.mediaError ? (
        <p className="stage__provider px-small px-muted" role="status">
          {t('stage.mediaStatusFailed')}{' '}
          <Button variant="ghost" onClick={stage.reloadMedia}>
            {t('stage.retry')}
          </Button>
        </p>
      ) : null}

      <div
        className={`scene ${focus ? seatClass(focus.seat) : ''}`}
        data-scene={scene}
        style={{ '--focus-x': `${focusX}%` } as CSSProperties}
      >
        <SceneBackdrop scene={scene} />
        <div className="scene__spotlight" hidden={focusIndex < 0} />
        <ul
          className="scene__cast"
          role="list"
          style={{ gridTemplateColumns: `repeat(${debate.participants.length}, minmax(0, 1fr))` }}
        >
          {debate.participants.map((p) => {
            const s = states[p.character.id] ?? 'IDLE';
            const active = p.character.id === focusId;
            return (
              <li
                key={p.character.id}
                className={`scene__seat ${seatClass(p.seat)} ${active ? 'is-active' : ''} ${
                  active && showVideo ? 'is-on-video' : ''
                }`}
                aria-current={active ? 'true' : undefined}
              >
                <Portrait
                  participant={p}
                  state={s}
                  large
                  label={active ? t('stage.portraitLabel', { name }) : undefined}
                />
                <span className="scene__nameplate">
                  <span className="scene__seat-name">{p.character.displayName}</span>
                  <span className="scene__seat-state">{t(`stage.states.${s}`)}</span>
                </span>
              </li>
            );
          })}
        </ul>
        <div className="scene__table" aria-hidden="true" />

        {/* Provider avatar surface (real-time or rendered), framed over the speaker's seat or,
            when the speaker is rendered without a background, standing in the set;
            always mounted so playback can attach. */}
        <video
          ref={attachVideo}
          className={`scene__video ${cutout ? 'is-cutout' : ''}`}
          hidden={!showVideo}
          playsInline
          aria-label={focus ? t('stage.avatarLabel', { name }) : undefined}
        />

        <div className="scene__lower-third">
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
            <p className="stage__idle">{t('stage.idle')}</p>
          )}
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
        </div>
      </div>

      <div className={`stage__focus ${focus ? seatClass(focus.seat) : ''}`}>
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
          <label className="stage__speed">
            <span>{t('stage.scene')}</span>
            <select value={scene} onChange={(e) => chooseScene(e.target.value as Scene)}>
              {SCENES.map((s) => (
                <option key={s} value={s}>
                  {t(`stage.scenes.${s}`)}
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
