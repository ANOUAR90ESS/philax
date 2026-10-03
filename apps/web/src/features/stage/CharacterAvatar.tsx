import type {
  AttireStyle,
  AvatarAppearance,
  AvatarState,
  FacialHairStyle,
  HairStyle,
  Presentation,
  Viseme,
} from '@philax/media';
import { VISEME_SHAPE } from '@philax/media';
import { useEffect, useId, useState, type ReactNode } from 'react';

interface Props {
  appearance: AvatarAppearance;
  presentation: Presentation;
  age: number;
  state: AvatarState;
  viseme: Viseme;
  /** Accessible name; omit for decorative copies next to a visible name. */
  label?: string;
  size?: 'small' | 'large';
  /** Static copies (transcript badges) do not blink. */
  animated?: boolean;
}

const CX = 100;
const CY = 92;

function faceRadii(shape: AvatarAppearance['faceShape'], presentation: Presentation) {
  const base = { oval: [43, 55], long: [39, 58], round: [47, 51], square: [45, 54] }[shape];
  const narrow = presentation === 'female' ? 3 : 0;
  return { rx: (base?.[0] ?? 43) - narrow, ry: base?.[1] ?? 55 };
}

/** Natural blinking at irregular intervals. */
function useBlink(enabled: boolean): boolean {
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(
        () => {
          setClosed(true);
          timer = setTimeout(() => {
            setClosed(false);
            schedule();
          }, 130);
        },
        2200 + Math.random() * 3800,
      );
    };
    schedule();
    return () => clearTimeout(timer);
  }, [enabled]);
  return closed;
}

function shade(hex: string, amount: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m?.[1]) return hex;
  const n = parseInt(m[1], 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v + amount * 255)));
  const r = c((n >> 16) & 255);
  const g = c((n >> 8) & 255);
  const b = c(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function HairBack({ style, color, rx }: { style: HairStyle; color: string; rx: number }) {
  switch (style) {
    case 'long':
      return (
        <path
          d={`M${CX - rx - 6} 80 Q${CX - rx - 10} 150 ${CX - rx + 2} 172 L${CX + rx - 2} 172 Q${CX + rx + 10} 150 ${CX + rx + 6} 80 Z`}
          fill={color}
        />
      );
    case 'loose-curls':
      return (
        <g fill={color}>
          {[-1, 1].flatMap((side) =>
            [86, 106, 126, 146].map((y, i) => (
              <circle key={`${side}${y}`} cx={CX + side * (rx + 4 - i)} cy={y} r={13} />
            )),
          )}
        </g>
      );
    case 'powdered-wig':
    case 'tied-wig':
      return (
        <path
          d={`M${CX - rx - 4} 78 Q${CX - rx - 6} 130 ${CX - 10} 136 L${CX + 10} 136 Q${CX + rx + 6} 130 ${CX + rx + 4} 78 Z`}
          fill={color}
        />
      );
    case 'wavy':
      return (
        <path
          d={`M${CX - rx - 7} 82 Q${CX - rx - 12} 118 ${CX - rx - 2} 132 Q${CX - rx + 6} 118 ${CX - rx + 4} 100 L${CX + rx - 4} 100 Q${CX + rx - 6} 118 ${CX + rx + 2} 132 Q${CX + rx + 12} 118 ${CX + rx + 7} 82 Z`}
          fill={color}
        />
      );
    default:
      return null;
  }
}

function HairFront({
  style,
  color,
  rx,
  ry,
}: {
  style: HairStyle;
  color: string;
  rx: number;
  ry: number;
}) {
  const top = CY - ry;
  const cap = (hairline: number, lift = 0) =>
    `M${CX - rx - 1} ${hairline + 18} Q${CX - rx} ${top - lift} ${CX} ${top - 4 - lift} Q${CX + rx} ${top - lift} ${CX + rx + 1} ${hairline + 18} Q${CX + rx - 8} ${hairline} ${CX} ${hairline} Q${CX - rx + 8} ${hairline} ${CX - rx - 1} ${hairline + 18} Z`;
  const sideTufts = (
    <>
      <path d={`M${CX - rx - 2} 98 Q${CX - rx - 5} 72 ${CX - rx + 10} 64 L${CX - rx + 6} 96 Z`} />
      <path d={`M${CX + rx + 2} 98 Q${CX + rx + 5} 72 ${CX + rx - 10} 64 L${CX + rx - 6} 96 Z`} />
    </>
  );
  switch (style) {
    case 'bald':
      return null;
    case 'balding':
      return <g fill={color}>{sideTufts}</g>;
    case 'receding':
      return (
        <g fill={color}>
          {sideTufts}
          <path d={cap(top + 16)} opacity={0.9} />
        </g>
      );
    case 'short':
    case 'topknot':
      return <path d={cap(top + 12)} fill={color} />;
    case 'swept-back':
      return <path d={cap(top + 10, 8)} fill={color} />;
    case 'quiff':
      return (
        <path
          d={`${cap(top + 12, 6)} M${CX - 24} ${top + 6} Q${CX - 6} ${top - 26} ${CX + 26} ${top - 8} Q${CX + 8} ${top + 2} ${CX - 24} ${top + 6} Z`}
          fill={color}
        />
      );
    case 'curly':
      return (
        <g fill={color}>
          <path d={cap(top + 12, 4)} />
          {[-36, -18, 0, 18, 36].map((dx) => (
            <circle key={dx} cx={CX + dx} cy={top + 2 - (Math.abs(dx) < 20 ? 4 : 0)} r={11} />
          ))}
        </g>
      );
    case 'wavy':
      return (
        <path
          d={`${cap(top + 14, 4)} M${CX - rx + 2} ${top + 26} Q${CX - 10} ${top + 6} ${CX + 6} ${top + 16} Q${CX - 12} ${top + 14} ${CX - rx + 2} ${top + 26} Z`}
          fill={color}
        />
      );
    case 'long':
      return <path d={cap(top + 14)} fill={color} />;
    case 'loose-curls':
      return (
        <g fill={color}>
          <path d={cap(top + 14, 4)} />
          {[-30, -12, 8, 26].map((dx) => (
            <circle key={dx} cx={CX + dx} cy={top + 8} r={10} />
          ))}
        </g>
      );
    case 'powdered-wig':
    case 'tied-wig':
      return (
        <g fill={color}>
          <path d={cap(top + 12, 4)} />
          {[-1, 1].flatMap((side) =>
            (style === 'powdered-wig' ? [84, 100] : [92]).map((y) => (
              <ellipse key={`${side}${y}`} cx={CX + side * (rx + 2)} cy={y} rx={9} ry={7} />
            )),
          )}
        </g>
      );
    case 'updo':
      return (
        <g fill={color}>
          <path d={cap(top + 14, 2)} />
          <ellipse cx={CX} cy={top - 6} rx={22} ry={14} />
        </g>
      );
    default:
      return null;
  }
}

function Headwear({
  kind,
  top,
  rx,
}: {
  kind: AvatarAppearance['headwear'];
  top: number;
  rx: number;
}) {
  switch (kind) {
    case 'fur-cap':
      return (
        <g>
          <path
            d={`M${CX - rx - 4} ${top + 22} Q${CX - rx - 2} ${top - 26} ${CX} ${top - 30} Q${CX + rx + 2} ${top - 26} ${CX + rx + 4} ${top + 22} Z`}
            fill="#5b4632"
          />
          <rect
            x={CX - rx - 6}
            y={top + 12}
            width={2 * rx + 12}
            height={14}
            rx={7}
            fill="#7a6248"
          />
        </g>
      );
    case 'scholar-cap':
      return (
        <g fill="#1d1f24">
          <path
            d={`M${CX - 26} ${top + 8} L${CX - 20} ${top - 22} L${CX + 20} ${top - 22} L${CX + 26} ${top + 8} Z`}
          />
          <rect x={CX - 32} y={top + 4} width={64} height={8} rx={3} />
        </g>
      );
    case 'turban':
      return (
        <g>
          <path
            d={`M${CX - rx - 4} ${top + 24} Q${CX - rx - 6} ${top - 20} ${CX} ${top - 24} Q${CX + rx + 6} ${top - 20} ${CX + rx + 4} ${top + 24} Q${CX} ${top + 8} ${CX - rx - 4} ${top + 24} Z`}
            fill="#a8463d"
          />
          <path
            d={`M${CX - rx} ${top + 8} Q${CX} ${top - 14} ${CX + rx} ${top + 4}`}
            stroke="#7e2f28"
            strokeWidth={4}
            fill="none"
          />
        </g>
      );
    default:
      return null;
  }
}

function Attire({ style, color, accent }: { style: AttireStyle; color: string; accent: string }) {
  const body = 'M18 200 Q24 168 70 160 L130 160 Q176 168 182 200 Z';
  const parts: Record<AttireStyle, ReactNode> = {
    himation: (
      <>
        <path d={body} fill={color} />
        <path d="M62 162 Q100 200 150 166 L162 176 Q110 214 52 172 Z" fill={shade(color, -0.12)} />
        <path d="M140 164 L182 200 L150 200 Z" fill={accent} opacity={0.5} />
      </>
    ),
    'scholar-robe': (
      <>
        <path d={body} fill={color} />
        <path d="M78 158 L100 196 L122 158 L114 158 L100 182 L86 158 Z" fill={accent} />
      </>
    ),
    'puritan-collar': (
      <>
        <path d={body} fill={color} />
        <path d="M68 160 Q100 186 132 160 L142 172 Q100 196 58 172 Z" fill={accent} />
      </>
    ),
    'periwig-coat': (
      <>
        <path d={body} fill={color} />
        <path d="M88 158 L112 158 L108 186 Q100 192 92 186 Z" fill={accent} />
      </>
    ),
    '18c-coat': (
      <>
        <path d={body} fill={color} />
        <path d="M86 158 L114 158 L110 180 Q100 188 90 180 Z" fill={accent} />
        <path d="M70 162 L92 200 M130 162 L108 200" stroke={shade(color, -0.2)} strokeWidth={3} />
      </>
    ),
    'regency-gown': (
      <>
        <path d={body} fill={color} />
        <path d="M66 162 Q100 186 134 162" stroke={accent} strokeWidth={3} fill="none" />
        <path d="M30 192 L170 192" stroke={accent} strokeWidth={4} />
      </>
    ),
    '19c-frockcoat': (
      <>
        <path d={body} fill={color} />
        <path d="M84 156 L116 156 L112 170 L88 170 Z" fill={accent} />
        <path d="M90 168 L110 168 L104 178 L96 178 Z" fill="#141414" />
        <path d="M76 162 L96 200 M124 162 L104 200" stroke={shade(color, 0.12)} strokeWidth={2} />
      </>
    ),
    '20c-suit': (
      <>
        <path d={body} fill={color} />
        <path d="M84 158 L100 200 L116 158 Z" fill={accent} />
        <path d="M96 166 L104 166 L106 198 L100 202 L94 198 Z" fill={shade(color, -0.25)} />
        <path d="M80 160 L98 200 M120 160 L102 200" stroke={shade(color, 0.15)} strokeWidth={2} />
      </>
    ),
    '20c-open-collar': (
      <>
        <path d={body} fill={color} />
        <path d="M82 158 L100 186 L118 158 L110 156 L100 172 L90 156 Z" fill={accent} />
      </>
    ),
    '20c-blouse': (
      <>
        <path d={body} fill={color} />
        <path d="M80 160 Q100 182 120 160" stroke={accent} strokeWidth={4} fill="none" />
      </>
    ),
    'loden-jacket': (
      <>
        <path d={body} fill={color} />
        <path d="M84 156 L116 156 L114 166 L86 166 Z" fill={accent} />
        <path d="M100 166 L100 200" stroke={accent} strokeWidth={2} />
      </>
    ),
  };
  return <g>{parts[style]}</g>;
}

function Beard({
  style,
  color,
  rx,
  ry,
}: {
  style: FacialHairStyle;
  color: string;
  rx: number;
  ry: number;
}) {
  const chin = CY + ry;
  const jaw = (drop: number, cheek: number) =>
    `M${CX - rx + 3} ${cheek} Q${CX - rx + 4} ${chin - 6 + drop} ${CX} ${chin + drop} Q${CX + rx - 4} ${chin - 6 + drop} ${CX + rx - 3} ${cheek} Q${CX + rx - 10} ${CY + 30} ${CX} ${CY + 42} Q${CX - rx + 10} ${CY + 30} ${CX - rx + 3} ${cheek} Z`;
  switch (style) {
    case 'short-beard':
      return <path d={jaw(4, CY + 14)} fill={color} />;
    case 'full-beard':
      return <path d={jaw(16, CY + 6)} fill={color} />;
    case 'long-beard':
      return <path d={jaw(42, CY + 6)} fill={color} />;
    case 'mustache-tuft':
      return (
        <path
          d={`M${CX - 5} ${chin - 6} Q${CX} ${chin + 10} ${CX + 5} ${chin - 6} Z`}
          fill={color}
        />
      );
    default:
      return null;
  }
}

function Mustache({ style, color }: { style: FacialHairStyle; color: string }) {
  const y = CY + 27;
  switch (style) {
    case 'none':
      return null;
    case 'walrus-mustache':
      return (
        <path
          d={`M${CX - 22} ${y + 10} Q${CX - 20} ${y - 6} ${CX} ${y - 4} Q${CX + 20} ${y - 6} ${CX + 22} ${y + 10} Q${CX + 10} ${y + 4} ${CX} ${y + 6} Q${CX - 10} ${y + 4} ${CX - 22} ${y + 10} Z`}
          fill={color}
        />
      );
    case 'mustache-tuft':
      return (
        <path
          d={`M${CX - 14} ${y + 2} Q${CX} ${y - 6} ${CX + 14} ${y + 2} Q${CX} ${y} ${CX - 14} ${y + 2} Z`}
          fill={color}
        />
      );
    default:
      return (
        <path
          d={`M${CX - 15} ${y + 3} Q${CX - 8} ${y - 5} ${CX} ${y - 2} Q${CX + 8} ${y - 5} ${CX + 15} ${y + 3} Q${CX} ${y + 1} ${CX - 15} ${y + 3} Z`}
          fill={color}
        />
      );
  }
}

/** Eyebrow lift (px) and inner-corner tilt for each state. */
const BROWS: Record<AvatarState, { lift: number; tilt: number; gaze: [number, number] }> = {
  IDLE: { lift: 0, tilt: 0, gaze: [0, 0] },
  LISTENING: { lift: 1, tilt: 0, gaze: [0, 0] },
  THINKING: { lift: 2, tilt: -2, gaze: [2, -2] },
  SPEAKING: { lift: 1, tilt: 0, gaze: [0, 0] },
  CHALLENGING: { lift: -1, tilt: 3, gaze: [0, 0] },
  RESPONDING: { lift: 1, tilt: 0, gaze: [0, 0] },
  AGREEING: { lift: 2, tilt: -1, gaze: [0, 0] },
  DISAGREEING: { lift: -2, tilt: 3, gaze: [0, 1] },
  CONSIDERING: { lift: 2, tilt: -2, gaze: [-1, -1] },
};

/**
 * A procedurally drawn period portrait. Animation is restrained: blinking,
 * a slight head movement per state and a mouth that follows the voice.
 */
export function CharacterAvatar({
  appearance,
  presentation,
  age,
  state,
  viseme,
  label,
  size = 'small',
  animated = true,
}: Props) {
  const blink = useBlink(animated);
  const clipId = `portrait-clip-${useId().replace(/:/g, '')}`;
  const { rx, ry } = faceRadii(appearance.faceShape, presentation);
  const skin = appearance.skinTone;
  const skinShadow = shade(skin, -0.12);
  const female = presentation === 'female';
  const brow = BROWS[state];
  const mouth = VISEME_SHAPE[viseme];
  const mouthW = 9 + mouth.width * 9;
  const mouthH = 1 + mouth.open * 9;
  const mouthY = CY + 36;
  const browColor =
    appearance.hair.style === 'powdered-wig' || appearance.hair.style === 'bald'
      ? shade(skin, -0.45)
      : appearance.facialHair.style !== 'none'
        ? appearance.facialHair.color
        : appearance.hair.color;
  const eyeY = CY - 2;
  const lid = blink ? 7 : state === 'THINKING' || state === 'CONSIDERING' ? 2 : 0;
  const lines = age >= 70 ? 3 : age >= 55 ? 2 : age >= 45 ? 1 : 0;

  return (
    <svg
      className={`portrait portrait--${size} portrait--${state.toLowerCase()}`}
      viewBox="0 0 200 200"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <defs>
        <clipPath id={clipId}>
          <circle cx={100} cy={100} r={98} />
        </clipPath>
      </defs>
      <circle cx={100} cy={100} r={98} className="portrait__ground" />
      <g clipPath={`url(#${clipId})`}>
        <g className="portrait__body">
          <Attire {...appearance.attire} />
        </g>
        <g className="portrait__head">
          <HairBack style={appearance.hair.style} color={appearance.hair.color} rx={rx} />
          <rect x={CX - 13} y={CY + ry - 14} width={26} height={30} fill={skinShadow} />
          <ellipse cx={CX - rx} cy={CY + 4} rx={6} ry={10} fill={skinShadow} />
          <ellipse cx={CX + rx} cy={CY + 4} rx={6} ry={10} fill={skinShadow} />
          {appearance.faceShape === 'square' ? (
            <rect
              x={CX - rx}
              y={CY - ry}
              width={2 * rx}
              height={2 * ry}
              rx={rx * 0.8}
              fill={skin}
            />
          ) : (
            <ellipse cx={CX} cy={CY} rx={rx} ry={ry} fill={skin} />
          )}
          {Array.from({ length: lines }, (_, i) => (
            <path
              key={i}
              d={`M${CX - 16} ${CY - 26 - i * 5} Q${CX} ${CY - 29 - i * 5} ${CX + 16} ${CY - 26 - i * 5}`}
              stroke={skinShadow}
              strokeWidth={1.2}
              fill="none"
            />
          ))}
          <Beard
            style={appearance.facialHair.style}
            color={appearance.facialHair.color}
            rx={rx}
            ry={ry}
          />
          {/* Eyes */}
          {[-1, 1].map((side) => {
            const ex = CX + side * 16;
            return (
              <g key={side}>
                <ellipse cx={ex} cy={eyeY} rx={7} ry={4.5} fill="#fbf8f2" />
                <circle cx={ex + brow.gaze[0]} cy={eyeY + brow.gaze[1]} r={3.2} fill="#3a2a20" />
                <circle cx={ex + brow.gaze[0]} cy={eyeY + brow.gaze[1]} r={1.4} fill="#0d0a08" />
                {lid ? (
                  <rect x={ex - 8} y={eyeY - 6} width={16} height={lid + 1} fill={skin} />
                ) : null}
                {female ? (
                  <path
                    d={`M${ex - 7} ${eyeY - 2} Q${ex} ${eyeY - 7} ${ex + 7} ${eyeY - 2}`}
                    stroke="#2a1d16"
                    strokeWidth={1.4}
                    fill="none"
                  />
                ) : null}
                <path
                  className="portrait__brow"
                  d={`M${ex - 9} ${eyeY - 10 - brow.lift} L${ex + 9} ${eyeY - 10 - brow.lift}`}
                  transform={`rotate(${-side * brow.tilt} ${ex} ${eyeY - 10})`}
                  stroke={browColor}
                  strokeWidth={female ? 2 : 3}
                  strokeLinecap="round"
                />
              </g>
            );
          })}
          {appearance.glasses !== 'none' ? (
            <g
              stroke="#1c1a18"
              strokeWidth={appearance.glasses === 'round-thick' ? 3.2 : 1.8}
              fill="rgba(255,255,255,0.08)"
            >
              {[-1, 1].map((side) =>
                appearance.glasses === 'rectangular' ? (
                  <rect
                    key={side}
                    x={CX + side * 16 - 10}
                    y={eyeY - 7}
                    width={20}
                    height={14}
                    rx={3}
                  />
                ) : (
                  <circle key={side} cx={CX + side * 16} cy={eyeY} r={10} />
                ),
              )}
              <path d={`M${CX - 6} ${eyeY} Q${CX} ${eyeY - 4} ${CX + 6} ${eyeY}`} fill="none" />
            </g>
          ) : null}
          {/* Nose */}
          <path
            d={`M${CX - 1} ${CY + 2} Q${CX - 6} ${CY + 18} ${CX - 4} ${CY + 21} Q${CX} ${CY + 23} ${CX + 5} ${CY + 21}`}
            stroke={skinShadow}
            strokeWidth={2}
            fill="none"
          />
          {/* Mouth */}
          <ellipse
            className="portrait__mouth"
            cx={CX}
            cy={mouthY}
            rx={mouthW}
            ry={mouthH}
            fill={mouthH > 1.5 ? '#5a2a26' : 'none'}
            stroke={female ? '#a8524d' : '#8a4a40'}
            strokeWidth={female ? 2.4 : 1.8}
          />
          <Mustache style={appearance.facialHair.style} color={appearance.facialHair.color} />
          <HairFront style={appearance.hair.style} color={appearance.hair.color} rx={rx} ry={ry} />
          <Headwear kind={appearance.headwear} top={CY - ry} rx={rx} />
        </g>
      </g>
      <circle cx={100} cy={100} r={98} className="portrait__ring" />
    </svg>
  );
}
