import { useEffect, useMemo, useState } from 'react';

// ═══════════════════════════════════════════════════════════════
// Icons — same engineering set as the login, stroke-only
// ═══════════════════════════════════════════════════════════════
const ICON_ART = {
  book: (
    <>
      <path d="M4 4h7a2 2 0 0 1 2 2v14" />
      <path d="M20 4h-7a2 2 0 0 0-2 2v14" />
      <path d="M4 4v16h7" />
      <path d="M20 4v16h-7" />
    </>
  ),
  atom: (
    <>
      <circle cx="12" cy="12" r="1" />
      <path d="M20.2 20.2c2.04-2.03.02-7.36-4.5-11.9-4.54-4.52-9.87-6.54-11.9-4.5-2.04 2.03-.02 7.36 4.5 11.9 4.54 4.52 9.87 6.54 11.9 4.5z" />
      <path d="M15.7 15.7c4.52-4.54 6.54-9.87 4.5-11.9-2.03-2.04-7.36-.02-11.9 4.5-4.52 4.54-6.54 9.87-4.5 11.9 2.03 2.04 7.36.02 11.9-4.5z" />
    </>
  ),
  flask: (
    <>
      <path d="M10 2v6.5L4.5 18a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 8.5V2" />
      <path d="M8.5 2h7" />
      <path d="M7 16h10" />
    </>
  ),
  chip: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
      <path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2" />
    </>
  ),
  code: (
    <>
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </>
  ),
  ruler: (
    <>
      <path d="M21.3 8.7 15.3 2.7a1 1 0 0 0-1.4 0L2.7 13.9a1 1 0 0 0 0 1.4l6 6a1 1 0 0 0 1.4 0L21.3 10a1 1 0 0 0 0-1.3z" />
      <path d="m7.5 10.5 2 2" />
      <path d="m10.5 7.5 2 2" />
      <path d="m13.5 4.5 2 2" />
      <path d="m4.5 13.5 2 2" />
    </>
  ),
  calc: (
    <>
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <rect x="7" y="6" width="10" height="3" rx="1" />
      <path d="M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01M16 17h.01" />
    </>
  ),
  bulb: (
    <>
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>
  ),
  gradCap: (
    <>
      <path d="M22 10 12 5 2 10l10 5 10-5z" />
      <path d="M6 12v5c3 3 9 3 12 0v-5" />
      <path d="M22 10v6" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </>
  ),
};

// 14 floating icons — moderate, not 20 like the login (dashboard has content)
const FLOATERS = [
  { icon: 'atom',    x: 6,  y: 14, size: 44, rot: -12, dur: 46, dx: 26, dy: 32 },
  { icon: 'chip',    x: 92, y: 20, size: 48, rot: 18,  dur: 52, dx: 22, dy: 36 },
  { icon: 'code',    x: 12, y: 68, size: 40, rot: 14,  dur: 48, dx: 28, dy: 30 },
  { icon: 'flask',   x: 88, y: 78, size: 44, rot: -10, dur: 55, dx: 24, dy: 34 },
  { icon: 'gear',    x: 4,  y: 42, size: 42, rot: 22,  dur: 42, dx: 30, dy: 28 },
  { icon: 'book',    x: 96, y: 50, size: 46, rot: -8,  dur: 50, dx: 26, dy: 30 },
  { icon: 'gradCap', x: 34, y: 6,  size: 38, rot: 10,  dur: 46, dx: 24, dy: 32 },
  { icon: 'bulb',    x: 66, y: 6,  size: 36, rot: -14, dur: 44, dx: 22, dy: 28 },
  { icon: 'ruler',   x: 26, y: 92, size: 40, rot: 16,  dur: 54, dx: 26, dy: 26 },
  { icon: 'globe',   x: 74, y: 92, size: 42, rot: -18, dur: 48, dx: 24, dy: 30 },
  { icon: 'calc',    x: 48, y: 12, size: 34, rot: 8,   dur: 50, dx: 20, dy: 32 },
  { icon: 'compass', x: 50, y: 88, size: 36, rot: -6,  dur: 46, dx: 22, dy: 28 },
  { icon: 'chip',    x: 20, y: 52, size: 32, rot: -22, dur: 58, dx: 24, dy: 24 },
  { icon: 'atom',    x: 78, y: 38, size: 30, rot: 12,  dur: 56, dx: 20, dy: 26 },
];

// ═══════════════════════════════════════════════════════════════
// Scene — orbiting atom (top-right corner)
// ═══════════════════════════════════════════════════════════════
function AtomScene() {
  return (
    <svg
      viewBox="0 0 200 200"
      className="dash-bg-scene dash-bg-scene--atom"
      aria-hidden="true"
    >
      <circle cx="100" cy="100" r="4" fill="rgba(37, 99, 235, 0.55)" />
      <circle cx="100" cy="100" r="10" fill="rgba(37, 99, 235, 0.1)" />

      <g transform="translate(100, 100)">
        <g>
          <animateTransform attributeName="transform" type="rotate"
            from="0" to="360" dur="14s" repeatCount="indefinite" />
          <ellipse cx="0" cy="0" rx="72" ry="26"
            fill="none" stroke="rgba(37, 99, 235, 0.22)" strokeWidth="1" />
          <circle cx="72" cy="0" r="3" fill="#2563eb" opacity="0.7" />
        </g>
      </g>

      <g transform="translate(100, 100)">
        <g>
          <animateTransform attributeName="transform" type="rotate"
            from="60" to="420" dur="18s" repeatCount="indefinite" />
          <ellipse cx="0" cy="0" rx="72" ry="26"
            fill="none" stroke="rgba(37, 99, 235, 0.22)" strokeWidth="1" />
          <circle cx="72" cy="0" r="3" fill="#2563eb" opacity="0.7" />
        </g>
      </g>

      <g transform="translate(100, 100)">
        <g>
          <animateTransform attributeName="transform" type="rotate"
            from="-60" to="300" dur="22s" repeatCount="indefinite" />
          <ellipse cx="0" cy="0" rx="72" ry="26"
            fill="none" stroke="rgba(37, 99, 235, 0.22)" strokeWidth="1" />
          <circle cx="72" cy="0" r="3" fill="#2563eb" opacity="0.7" />
        </g>
      </g>
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════
// Scene — waveform (bottom-left corner)
// ═══════════════════════════════════════════════════════════════
function WaveScene() {
  const wavePath = 'M0,60 Q50,20 100,60 T200,60 T300,60 T400,60';
  return (
    <svg
      viewBox="0 0 400 120"
      className="dash-bg-scene dash-bg-scene--wave"
      aria-hidden="true"
      preserveAspectRatio="none"
    >
      <path
        d={wavePath}
        fill="none"
        stroke="rgba(37, 99, 235, 0.2)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle r="4" fill="#2563eb" opacity="0.55">
        <animateMotion dur="6s" repeatCount="indefinite" path={wavePath} />
      </circle>
      <circle r="8" fill="rgba(37, 99, 235, 0.18)">
        <animateMotion dur="6s" repeatCount="indefinite" path={wavePath} />
      </circle>
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════
// Scene — gear cluster (bottom-right corner)
// ═══════════════════════════════════════════════════════════════
function GearScene() {
  return (
    <svg
      viewBox="0 0 200 200"
      className="dash-bg-scene dash-bg-scene--gears"
      aria-hidden="true"
      fill="none"
      stroke="rgba(37, 99, 235, 0.35)"
      strokeWidth="0.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <g transform="translate(100, 100)">
        <g>
          <animateTransform attributeName="transform" type="rotate"
            from="0" to="360" dur="22s" repeatCount="indefinite" />
          <g transform="scale(3.5) translate(-12, -12)">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </g>
        </g>
      </g>
      <g transform="translate(158, 60)">
        <g>
          <animateTransform attributeName="transform" type="rotate"
            from="0" to="-360" dur="11s" repeatCount="indefinite" />
          <g transform="scale(1.8) translate(-12, -12)">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </g>
        </g>
      </g>
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════
const STYLES = `
  .dash-bg {
    position: fixed;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    z-index: 0;
    background: #f0f4f9;
  }

  /* Layer 1 — cycling soft gradient */
  .dash-bg__gradient {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      -45deg,
      #eef4ff 0%,
      #f0f9ff 25%,
      #f5f0ff 50%,
      #f0fdfa 75%,
      #eef4ff 100%
    );
    background-size: 400% 400%;
    animation: dash-bg-grad 32s ease infinite;
  }
  @keyframes dash-bg-grad {
    0%, 100% { background-position: 0% 50%; }
    50%      { background-position: 100% 50%; }
  }

  /* Layer 2 — soft drifting orbs */
  .dash-bg__orb {
    position: absolute;
    border-radius: 50%;
    filter: blur(90px);
    will-change: transform;
  }
  .dash-bg__orb--1 {
    width: 55vmax; height: 55vmax;
    top: -20vmax; right: -15vmax;
    background: radial-gradient(circle, rgba(96, 165, 250, 0.4), transparent 70%);
    animation: dash-bg-orb1 42s ease-in-out infinite;
  }
  .dash-bg__orb--2 {
    width: 50vmax; height: 50vmax;
    bottom: -20vmax; left: -15vmax;
    background: radial-gradient(circle, rgba(167, 139, 250, 0.35), transparent 70%);
    animation: dash-bg-orb2 50s ease-in-out infinite;
  }
  .dash-bg__orb--3 {
    width: 40vmax; height: 40vmax;
    top: 40%; left: 50%;
    transform: translate(-50%, -50%);
    background: radial-gradient(circle, rgba(34, 211, 238, 0.22), transparent 70%);
    animation: dash-bg-orb3 44s ease-in-out infinite;
  }
  @keyframes dash-bg-orb1 {
    0%, 100% { transform: translate(0, 0) scale(1); }
    50%      { transform: translate(-6vmax, 5vmax) scale(1.08); }
  }
  @keyframes dash-bg-orb2 {
    0%, 100% { transform: translate(0, 0) scale(1); }
    50%      { transform: translate(5vmax, -5vmax) scale(1.05); }
  }
  @keyframes dash-bg-orb3 {
    0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.85; }
    50%      { transform: translate(-46%, -54%) scale(1.15); opacity: 1; }
  }

  /* Layer 3 — dot grid */
  .dash-bg__grid {
    position: absolute;
    inset: 0;
    background-image: radial-gradient(rgba(37, 99, 235, 0.07) 1px, transparent 1px);
    background-size: 26px 26px;
    -webkit-mask-image: radial-gradient(ellipse at center, black 25%, transparent 85%);
    mask-image: radial-gradient(ellipse at center, black 25%, transparent 85%);
    opacity: 0.9;
  }

  /* Layer 4 — floating icons */
  .dash-bg__icons {
    position: absolute;
    inset: 0;
  }
  .dash-bg__icon {
    position: absolute;
    color: #1e40af;
    animation: dash-bg-float var(--dur, 46s) ease-in-out var(--float-delay, 0ms) infinite;
    will-change: transform;
  }
  .dash-bg__icon-inner {
    width: 100%; height: 100%;
    display: grid; place-items: center;
    opacity: 0;
    transform: scale(0.5) rotate(var(--rot, 0deg));
    animation: dash-bg-icon-in 900ms cubic-bezier(0.2, 0.8, 0.2, 1) var(--delay, 0ms) forwards;
    will-change: transform, opacity;
  }
  .dash-bg__icon svg {
    width: 100%; height: 100%; display: block;
  }
  .dash-bg__icon[data-icon="gear"] svg,
  .dash-bg__icon[data-icon="atom"] svg {
    animation: dash-bg-spin 30s linear infinite;
    transform-origin: 50% 50%;
  }
  @keyframes dash-bg-spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  @keyframes dash-bg-icon-in {
    to {
      opacity: var(--opacity, 0.09);
      transform: scale(1) rotate(var(--rot, 0deg));
    }
  }
  @keyframes dash-bg-float {
    0%, 100% { transform: translate(-50%, -50%) rotate(0deg); }
    33% {
      transform: translate(
        calc(-50% + var(--dx, 20px)),
        calc(-50% - var(--dy, 30px))
      ) rotate(var(--spin, 4deg));
    }
    66% {
      transform: translate(
        calc(-50% - var(--dx2, 14px)),
        calc(-50% + var(--dy2, 20px))
      ) rotate(calc(var(--spin, 4deg) * -0.6));
    }
  }

  /* Layer 5 — scenes */
  .dash-bg-scene {
    position: absolute;
    pointer-events: none;
    opacity: 0;
    animation: dash-bg-scene-in 1400ms ease 400ms forwards;
  }
  @keyframes dash-bg-scene-in { to { opacity: 1; } }

  .dash-bg-scene--atom {
    top: 24px;
    right: 24px;
    width: 180px;
    height: 180px;
    animation-delay: 400ms;
  }

  .dash-bg-scene--wave {
    bottom: 32px;
    left: 24px;
    width: 320px;
    height: 90px;
    animation-delay: 700ms;
  }

  .dash-bg-scene--gears {
    bottom: 24px;
    right: 24px;
    width: 180px;
    height: 180px;
    animation-delay: 550ms;
  }

  /* Layer 6 — film grain */
  .dash-bg__grain {
    position: absolute;
    inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    opacity: 0.03;
    mix-blend-mode: overlay;
    pointer-events: none;
  }

  /* Mobile tuning */
  @media (max-width: 768px) {
    .dash-bg__orb { filter: blur(70px); }
    .dash-bg__orb--1 { width: 300px; height: 300px; top: -80px; right: -80px; }
    .dash-bg__orb--2 { width: 280px; height: 280px; bottom: -80px; left: -80px; }
    .dash-bg__orb--3 { width: 240px; height: 240px; }
    .dash-bg__grid { background-size: 20px 20px; }
    .dash-bg__icon svg { stroke-width: 1.6; }
    .dash-bg-scene--atom,
    .dash-bg-scene--wave,
    .dash-bg-scene--gears { display: none; }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .dash-bg__gradient,
    .dash-bg__orb,
    .dash-bg__icon,
    .dash-bg__icon[data-icon="gear"] svg,
    .dash-bg__icon[data-icon="atom"] svg {
      animation: none !important;
    }
    .dash-bg__gradient { background-position: 50% 50%; }
    .dash-bg__icon-inner {
      animation: none !important;
      opacity: var(--opacity, 0.09);
      transform: scale(1) rotate(var(--rot, 0deg));
    }
    .dash-bg-scene { display: none; }
  }
`;

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function DashboardBackground() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const floaters = useMemo(() => FLOATERS, []);

  return (
    <div className="dash-bg" aria-hidden="true">
      <style>{STYLES}</style>

      <div className="dash-bg__gradient" />

      <div className="dash-bg__orb dash-bg__orb--1" />
      <div className="dash-bg__orb dash-bg__orb--2" />
      <div className="dash-bg__orb dash-bg__orb--3" />

      <div className="dash-bg__grid" />

      {mounted && (
        <div className="dash-bg__icons">
          {floaters.map((f, i) => {
            const delay = i * 65;
            return (
              <div
                key={i}
                className="dash-bg__icon"
                data-icon={f.icon}
                style={{
                  left: `${f.x}%`,
                  top: `${f.y}%`,
                  width: f.size,
                  height: f.size,
                  '--dur': `${f.dur}s`,
                  '--dx': `${f.dx}px`,
                  '--dy': `${f.dy}px`,
                  '--dx2': `${Math.round(f.dx * 0.7)}px`,
                  '--dy2': `${Math.round(f.dy * 0.5)}px`,
                  '--spin': `${f.rot > 0 ? 4 : -4}deg`,
                  '--float-delay': `${800 + delay}ms`,
                }}
              >
                <div
                  className="dash-bg__icon-inner"
                  style={{
                    '--opacity': 0.09,
                    '--rot': `${f.rot}deg`,
                    '--delay': `${delay}ms`,
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
                    {ICON_ART[f.icon]}
                  </svg>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AtomScene />
      <WaveScene />
      <GearScene />

      <div className="dash-bg__grain" />
    </div>
  );
} 