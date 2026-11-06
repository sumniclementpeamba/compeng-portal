import { useEffect, useMemo, useState } from 'react';

// ── Icon art (drawn inside a shared <svg> wrapper) ────────────
const ICON_ART = [
  // Closed book
  <>
    <path d="M4 4h7a2 2 0 0 1 2 2v14" />
    <path d="M20 4h-7a2 2 0 0 0-2 2v14" />
    <path d="M4 4v16h7" />
    <path d="M20 4v16h-7" />
  </>,
  // Open book
  <>
    <path d="M3 5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v15" />
    <path d="M21 5a2 2 0 0 0-2-2h-5a2 2 0 0 0-2 2v15" />
    <path d="M3 5v13a2 2 0 0 0 2 2h5" />
    <path d="M21 5v13a2 2 0 0 1-2 2h-5" />
  </>,
  // Pencil
  <>
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
    <path d="m15 5 4 4" />
  </>,
  // Graduation cap
  <>
    <path d="M22 10 12 5 2 10l10 5 10-5z" />
    <path d="M6 12v5c3 3 9 3 12 0v-5" />
    <path d="M22 10v6" />
  </>,
  // Atom
  <>
    <circle cx="12" cy="12" r="1" />
    <path d="M20.2 20.2c2.04-2.03.02-7.36-4.5-11.9-4.54-4.52-9.87-6.54-11.9-4.5-2.04 2.03-.02 7.36 4.5 11.9 4.54 4.52 9.87 6.54 11.9 4.5z" />
    <path d="M15.7 15.7c4.52-4.54 6.54-9.87 4.5-11.9-2.03-2.04-7.36-.02-11.9 4.5-4.52 4.54-6.54 9.87-4.5 11.9 2.03 2.04 7.36.02 11.9-4.5z" />
  </>,
  // Flask
  <>
    <path d="M10 2v6.5L4.5 18a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 8.5V2" />
    <path d="M8.5 2h7" />
    <path d="M7 16h10" />
  </>,
  // Ruler
  <>
    <path d="M21.3 8.7 15.3 2.7a1 1 0 0 0-1.4 0L2.7 13.9a1 1 0 0 0 0 1.4l6 6a1 1 0 0 0 1.4 0L21.3 10a1 1 0 0 0 0-1.3z" />
    <path d="m7.5 10.5 2 2" />
    <path d="m10.5 7.5 2 2" />
    <path d="m13.5 4.5 2 2" />
    <path d="m4.5 13.5 2 2" />
  </>,
  // Calculator
  <>
    <rect x="4" y="2" width="16" height="20" rx="2" />
    <rect x="7" y="6" width="10" height="3" rx="1" />
    <path d="M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01M16 17h.01" />
  </>,
  // Globe
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </>,
  // Lightbulb
  <>
    <path d="M9 18h6" />
    <path d="M10 22h4" />
    <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
  </>,
  // Compass
  <>
    <circle cx="12" cy="12" r="10" />
    <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
  </>,
  // Paper plane
  <>
    <path d="m22 2-7 20-4-9-9-4z" />
    <path d="M22 2 11 13" />
  </>,
];

// ── Position layout (16 slots, deterministic jitter) ─────────
const POSITIONS = [
  { x: 4,  y: 12, size: 42, delay: 0,   dur: 26, rot: -12 },
  { x: 14, y: 78, size: 58, delay: -6,  dur: 34, rot: 8 },
  { x: 24, y: 28, size: 34, delay: -14, dur: 28, rot: 22 },
  { x: 34, y: 88, size: 50, delay: -3,  dur: 36, rot: -8 },
  { x: 44, y: 14, size: 46, delay: -20, dur: 30, rot: 12 },
  { x: 54, y: 56, size: 38, delay: -8,  dur: 27, rot: -20 },
  { x: 64, y: 22, size: 54, delay: -16, dur: 34, rot: 5 },
  { x: 74, y: 72, size: 42, delay: -2,  dur: 29, rot: -12 },
  { x: 84, y: 38, size: 50, delay: -10, dur: 25, rot: 18 },
  { x: 94, y: 82, size: 36, delay: -18, dur: 32, rot: -5 },
  { x: 9,  y: 48, size: 40, delay: -12, dur: 31, rot: 15 },
  { x: 29, y: 62, size: 46, delay: -7,  dur: 24, rot: -22 },
  { x: 49, y: 38, size: 44, delay: -15, dur: 38, rot: 0 },
  { x: 69, y: 52, size: 32, delay: -1,  dur: 22, rot: 28 },
  { x: 89, y: 18, size: 48, delay: -9,  dur: 36, rot: -10 },
  { x: 59, y: 92, size: 42, delay: -4,  dur: 27, rot: 20 },
];

// ── CSS (inlined for zero extra asset requests) ──────────────
const STYLES = `
  .login-bg {
    position: fixed;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    z-index: 0;
    background: #0c1a3e;
  }

  .login-bg__gradient {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      -45deg,
      #0c1a3e 0%,
      #1e3a8a 25%,
      #4f46e5 50%,
      #0891b2 75%,
      #0c1a3e 100%
    );
    background-size: 400% 400%;
    animation: login-bg-gradient 26s ease infinite;
  }

  @keyframes login-bg-gradient {
    0%, 100% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
  }

  .login-bg__orb {
    position: absolute;
    border-radius: 50%;
    filter: blur(70px);
    opacity: 0.55;
    will-change: transform;
  }

  .login-bg__orb--1 {
    width: 60vmax; height: 60vmax;
    top: -20vmax; left: -20vmax;
    background: radial-gradient(circle, rgba(99,102,241,0.75), transparent 70%);
    animation: login-bg-orb1 24s ease-in-out infinite;
  }

  .login-bg__orb--2 {
    width: 55vmax; height: 55vmax;
    bottom: -20vmax; right: -15vmax;
    background: radial-gradient(circle, rgba(6,182,212,0.65), transparent 70%);
    animation: login-bg-orb2 30s ease-in-out infinite;
  }

  .login-bg__orb--3 {
    width: 40vmax; height: 40vmax;
    top: 40%; left: 55%;
    background: radial-gradient(circle, rgba(139,92,246,0.45), transparent 70%);
    animation: login-bg-orb3 20s ease-in-out infinite;
  }

  @keyframes login-bg-orb1 {
    0%, 100% { transform: translate(0, 0) scale(1); }
    50% { transform: translate(12vmax, 8vmax) scale(1.15); }
  }
  @keyframes login-bg-orb2 {
    0%, 100% { transform: translate(0, 0) scale(1); }
    50% { transform: translate(-10vmax, -6vmax) scale(1.1); }
  }
  @keyframes login-bg-orb3 {
    0%, 100% { transform: translate(-50%, -50%) scale(1); }
    50% { transform: translate(-45%, -55%) scale(1.2); }
  }

  .login-bg__grid {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px);
    background-size: 64px 64px;
    -webkit-mask-image: radial-gradient(ellipse at center, black 30%, transparent 80%);
    mask-image: radial-gradient(ellipse at center, black 30%, transparent 80%);
    opacity: 0.6;
  }

  .login-bg__icons {
    position: absolute;
    inset: 0;
  }

  .login-bg__icon {
    position: absolute;
    color: #ffffff;
    opacity: 0.10;
    transform: translate(-50%, -50%) rotate(var(--rot, 0deg));
    animation: login-bg-float var(--dur, 30s) ease-in-out infinite;
    animation-delay: var(--delay, 0s);
    will-change: transform, opacity;
  }

  .login-bg__icon svg {
    width: 100%;
    height: 100%;
    display: block;
  }

  @keyframes login-bg-float {
    0%, 100% {
      transform: translate(-50%, -50%) rotate(var(--rot, 0deg));
      opacity: 0.10;
    }
    33% {
      transform: translate(calc(-50% + 30px), calc(-50% - 45px)) rotate(calc(var(--rot, 0deg) + 12deg));
      opacity: 0.18;
    }
    66% {
      transform: translate(calc(-50% - 20px), calc(-50% - 25px)) rotate(calc(var(--rot, 0deg) - 8deg));
      opacity: 0.08;
    }
  }

  .login-bg__vignette {
    position: absolute;
    inset: 0;
    background: radial-gradient(
      ellipse at center,
      transparent 0%,
      transparent 35%,
      rgba(0,0,0,0.45) 100%
    );
    pointer-events: none;
  }

  @media (max-width: 768px) {
    .login-bg__orb { filter: blur(50px); opacity: 0.45; }
    .login-bg__grid { background-size: 40px 40px; }
    .login-bg__icon { opacity: 0.08; }
  }

  @media (prefers-reduced-motion: reduce) {
    .login-bg__gradient,
    .login-bg__orb,
    .login-bg__icon {
      animation: none !important;
    }
    .login-bg__gradient { background-position: 50% 50%; }
  }
`;

export default function LoginBackground() {
  // Delay icon rendering by one frame so the base gradient paints first
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Stable icon-to-position assignment
  const icons = useMemo(
    () =>
      POSITIONS.map((pos, i) => ({
        ...pos,
        Art: ICON_ART[i % ICON_ART.length],
      })),
    [],
  );

  return (
    <div className="login-bg" aria-hidden="true">
      <style>{STYLES}</style>

      <div className="login-bg__gradient" />
      <div className="login-bg__orb login-bg__orb--1" />
      <div className="login-bg__orb login-bg__orb--2" />
      <div className="login-bg__orb login-bg__orb--3" />
      <div className="login-bg__grid" />

      {mounted && (
        <div className="login-bg__icons">
          {icons.map(({ x, y, size, delay, dur, rot, Art }, i) => (
            <div
              key={i}
              className="login-bg__icon"
              style={{
                left: `${x}%`,
                top: `${y}%`,
                width: size,
                height: size,
                '--rot': `${rot}deg`,
                '--dur': `${dur}s`,
                '--delay': `${delay}s`,
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {Art}
              </svg>
            </div>
          ))}
        </div>
      )}

      <div className="login-bg__vignette" />
    </div>
  );
}