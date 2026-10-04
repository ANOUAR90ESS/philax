import { useId } from 'react';
import type { Scene } from './scenes';

const W = 1600;
const H = 900;

/** Deterministic pseudo-random sequence, so a set looks the same on every render. */
function seq(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function Studio({ id }: { id: string }) {
  const panels = [];
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 10; col++)
      panels.push(
        <rect
          key={`${row}-${col}`}
          x={70 + col * 148}
          y={90 + row * 132}
          width={128}
          height={112}
          rx={14}
          fill={(row + col) % 3 === 0 ? '#2b3a55' : '#24324a'}
        />,
      );
  return (
    <>
      <defs>
        <linearGradient id={`${id}-wall`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#141c2b" />
          <stop offset="1" stopColor="#1f2a3f" />
        </linearGradient>
        <radialGradient id={`${id}-lamp`}>
          <stop offset="0" stopColor="#ffcf8a" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffcf8a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${id}-wall)`} />
      {panels}
      <circle cx={190} cy={150} r={170} fill={`url(#${id}-lamp)`} />
      <circle cx={1410} cy={150} r={170} fill={`url(#${id}-lamp)`} />
      <rect x={1240} y={40} width={150} height={44} rx={8} fill="#3a1e24" />
      <text
        x={1315}
        y={70}
        textAnchor="middle"
        fontFamily="system-ui, sans-serif"
        fontSize={22}
        fontWeight={700}
        fill="#ff6b6b"
        letterSpacing={3}
      >
        ON AIR
      </text>
      <rect y={520} width={W} height={380} fill="#121927" />
    </>
  );
}

function Library({ id }: { id: string }) {
  const rand = seq(7);
  const books = [];
  const colors = ['#7a2e2e', '#2f4d3a', '#8a6a2f', '#3b3f6b', '#5b3a29', '#6e5a3c', '#284454'];
  for (let shelf = 0; shelf < 4; shelf++) {
    let x = 40;
    while (x < W - 40) {
      const w = 18 + Math.floor(rand() * 22);
      const h = 80 + Math.floor(rand() * 30);
      const gap = rand() < 0.08 ? 30 : 2;
      books.push(
        <rect
          key={`${shelf}-${x}`}
          x={x}
          y={40 + shelf * 125 + (112 - h)}
          width={w}
          height={h}
          rx={2}
          fill={colors[Math.floor(rand() * colors.length)]}
        />,
      );
      x += w + gap;
    }
  }
  return (
    <>
      <defs>
        <radialGradient id={`${id}-glow`} cx="0.5" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#ffd9a0" stopOpacity="0.35" />
          <stop offset="1" stopColor="#ffd9a0" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width={W} height={H} fill="#2a1d14" />
      {books}
      {[0, 1, 2, 3].map((s) => (
        <rect key={s} x={20} y={152 + s * 125} width={W - 40} height={14} fill="#4a3322" />
      ))}
      <rect width={W} height={H} fill={`url(#${id}-glow)`} />
      <rect y={540} width={W} height={360} fill="#22170f" />
    </>
  );
}

function Agora({ id }: { id: string }) {
  const columns = [];
  for (let i = 0; i < 7; i++) {
    const x = 90 + i * 230;
    columns.push(
      <g key={i} fill="#e9e1cf">
        <rect x={x - 10} y={110} width={100} height={26} />
        <rect x={x} y={136} width={80} height={330} />
        {[16, 32, 48, 64].map((dx) => (
          <rect key={dx} x={x + dx - 2} y={136} width={3} height={330} fill="#d4cab3" />
        ))}
        <rect x={x - 10} y={466} width={100} height={22} />
      </g>,
    );
  }
  return (
    <>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f2b880" />
          <stop offset="0.6" stopColor="#f6d6a8" />
          <stop offset="1" stopColor="#efe4cc" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${id}-sky)`} />
      <circle cx={1300} cy={300} r={70} fill="#fff1d6" opacity={0.8} />
      <polygon points={`40,110 ${W / 2},20 ${W - 40},110`} fill="#e3d9c2" />
      {columns}
      <rect y={488} width={W} height={40} fill="#d8ccb0" />
      <rect y={528} width={W} height={372} fill="#cdbf9f" />
    </>
  );
}

function Hall({ id }: { id: string }) {
  const folds = [];
  for (let i = 0; i < 12; i++)
    folds.push(
      <rect
        key={i}
        x={i < 6 ? i * 40 : W - (12 - i) * 40}
        y={0}
        width={22}
        height={560}
        fill="#5c0f1a"
        opacity={0.6}
      />,
    );
  return (
    <>
      <defs>
        <linearGradient id={`${id}-wood`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b2417" />
          <stop offset="1" stopColor="#2a190f" />
        </linearGradient>
        <radialGradient id={`${id}-light`} cx="0.5" cy="0" r="0.8">
          <stop offset="0" stopColor="#fff2cf" stopOpacity="0.4" />
          <stop offset="1" stopColor="#fff2cf" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${id}-wood)`} />
      {[0, 1, 2, 3, 4].map((i) => (
        <rect
          key={i}
          x={300 + i * 210}
          y={120}
          width={170}
          height={330}
          rx={6}
          fill="none"
          stroke="#5a3a26"
          strokeWidth={6}
        />
      ))}
      <rect x={0} y={0} width={250} height={560} fill="#7a1424" />
      <rect x={W - 250} y={0} width={250} height={560} fill="#7a1424" />
      {folds}
      <rect x={0} y={0} width={W} height={60} fill="#6a1220" />
      <rect width={W} height={H} fill={`url(#${id}-light)`} />
      <rect y={540} width={W} height={360} fill="#24150c" />
    </>
  );
}

const SETS: Record<Scene, (p: { id: string }) => React.JSX.Element> = {
  studio: Studio,
  library: Library,
  agora: Agora,
  hall: Hall,
};

/** The designed background of the debate set (decorative). */
export function SceneBackdrop({ scene }: { scene: Scene }) {
  const id = `scene-${useId().replace(/:/g, '')}`;
  const Set = SETS[scene];
  return (
    <svg
      className="scene__backdrop"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <Set id={id} />
    </svg>
  );
}
