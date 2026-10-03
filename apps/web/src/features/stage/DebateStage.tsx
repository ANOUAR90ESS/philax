import type { AvatarState, ProfileResolution } from '@philax/media';
import type { DebateParticipant, DebateView } from '@philax/types';
import { Button, seatClass } from '@philax/ui';
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import type { LiveDraft } from '../../hooks/useDebate';
import { initials } from '../characters/ParticipantCard';
import { CharacterAvatar } from './CharacterAvatar';
import type { StageController } from './useStage';

interface Props {
  debate: DebateView;
  draft: LiveDraft | null;
  stage: StageController;
}

function Portrait({
  participant,
  media,
  stage,
  state,
  large,
  label,
}: {
  participant: DebateParticipant;
  media: ProfileResolution;
  stage: StageController;
  state: AvatarState;
  large: boolean;
  label?: string;
}) {
  const { t } = useTranslation();
  const avatar = stage.avatars.get(participant.character.id);
  const speaking = stage.snapshot.plan?.characterId === participant.character.id;
  if (media.status !== 'ready' || avatar?.status !== 'ready' || !avatar.avatar.appearance) {
    // No validated likeness: show a neutral monogram, never someone else's face.
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
    <CharacterAvatar
      appearance={avatar.avatar.appearance}
      presentation={avatar.avatar.presentation}
      age={media.profile.visualIdentity.approximateAge ?? 50}
      state={state}
      viseme={speaking ? stage.snapshot.viseme : 'rest'}
      size={large ? 'large' : 'small'}
      label={label}
    />
  );
}

/**
 * The debate as a scene: the whole cast is visible, the current speaker is in
 * focus with voice, lip-synced mouth and subtitles, and the others listen.
 */
export function DebateStage({ debate, draft, stage }: Props) {
  const { t } = useTranslation();
  const { snapshot, states } = stage;
  const focusId = snapshot.plan?.characterId ?? draft?.characterId ?? null;
  const focus = debate.participants.find((p) => p.character.id === focusId);
  const segment = snapshot.plan?.segments[snapshot.segmentIndex];
  const focusMedia = focus ? stage.registry.resolve(focus.character.slug) : null;
  const name = focus?.character.displayName ?? '';
  const state = focus ? (states[focus.character.id] ?? 'IDLE') : 'IDLE';

  if (!debate.participants.length) return null;

  return (
    <section className="stage" aria-label={t('stage.label')}>
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
              <Portrait
                participant={p}
                media={stage.registry.resolve(p.character.slug)}
                stage={stage}
                state={s}
                large={false}
              />
              <span className="stage__seat-name">{p.character.displayName}</span>
              <span className="stage__seat-state">{t(`stage.states.${s}`)}</span>
            </li>
          );
        })}
      </ul>

      <div className={`stage__focus ${focus ? seatClass(focus.seat) : ''}`}>
        {focus && focusMedia ? (
          <>
            <p className="stage__now">
              {snapshot.plan ? t('stage.speaking') : t('stage.preparing')} <strong>{name}</strong>
              <span className="stage__role">
                {' · '}
                {focus.perspective.label}
                {focus.role !== 'debater' ? ` · ${t(`debate.roles.${focus.role}`)}` : ''}
              </span>
            </p>
            <Portrait
              participant={focus}
              media={focusMedia}
              stage={stage}
              state={state}
              large
              label={t('stage.portraitLabel', { name })}
            />
            <p className="stage__disclosure px-small">{t('stage.disclosure', { name })}</p>
          </>
        ) : (
          <p className="stage__idle px-muted">{t('stage.idle')}</p>
        )}

        {segment ? (
          <p className="stage__subtitles" dir="auto" lang={debate.language} aria-hidden="true">
            {segment.words.map((w, i) => (
              <Fragment key={`${segment.index}-${w.start}`}>
                <span
                  className={i === snapshot.wordIndex ? 'stage__word is-current' : 'stage__word'}
                >
                  {w.text}
                </span>{' '}
              </Fragment>
            ))}
          </p>
        ) : null}

        {snapshot.plan && snapshot.audio === 'text-only' && snapshot.voiceIssue ? (
          <p className="stage__voice-note px-small px-muted">
            {t(`stage.voiceIssue.${snapshot.voiceIssue}`, { name })}
          </p>
        ) : null}

        <div className="stage__controls">
          <Button
            variant="ghost"
            aria-pressed={stage.muted}
            onClick={() => stage.setMuted(!stage.muted)}
          >
            {stage.muted ? t('stage.unmute') : t('stage.mute')}
          </Button>
          <Button variant="ghost" onClick={stage.skip} disabled={!snapshot.plan}>
            {t('stage.skip')}
          </Button>
        </div>
      </div>
    </section>
  );
}
