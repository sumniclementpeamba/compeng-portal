const STYLES = `
  .anim-title {
    display: inline-block;
    position: relative;
  }

  /* ── Layer 1: per-char entrance (visible during cascade) ── */
  .anim-title__chars {
    display: inline-block;
    animation: anim-title-fade-out 400ms ease 1400ms forwards;
  }

  .anim-title__char {
    display: inline-block;
    opacity: 0;
    transform: translateY(16px) scale(0.9);
    color: #ffffff;
    animation: anim-title-char-in 700ms cubic-bezier(0.2, 0.8, 0.2, 1)
      var(--delay, 0ms) forwards;
    will-change: transform, opacity;
  }

  /* ── Layer 2: gradient overlay (fades in after cascade) ── */
  .anim-title__gradient {
    position: absolute;
    inset: 0;
    display: inline-block;
    white-space: nowrap;
    background: linear-gradient(
      90deg,
      #a5b4fc 0%,
      #818cf8 25%,
      #67e8f9 50%,
      #c4b5fd 75%,
      #a5b4fc 100%
    );
    background-size: 300% 100%;
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    color: transparent;
    opacity: 0;
    animation:
      anim-title-flow 8s linear infinite,
      anim-title-fade-in 900ms ease 1400ms forwards,
      anim-title-glow 4s ease-in-out 2300ms infinite;
    pointer-events: none;
  }

  /* ── Keyframes ────────────────────────────────────────── */
  @keyframes anim-title-char-in {
    0%   { opacity: 0; transform: translateY(16px) scale(0.9); }
    100% { opacity: 1; transform: translateY(0) scale(1); }
  }

  @keyframes anim-title-fade-out {
    from { opacity: 1; }
    to   { opacity: 0; }
  }

  @keyframes anim-title-fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  @keyframes anim-title-flow {
    0%   { background-position: 0% 50%; }
    100% { background-position: 300% 50%; }
  }

  @keyframes anim-title-glow {
    0%, 100% { filter: drop-shadow(0 0 16px rgba(129, 140, 248, 0.30)); }
    50%      { filter: drop-shadow(0 0 24px rgba(34, 211, 238, 0.45)); }
  }

  /* ── Reduced motion: show the final gradient state instantly ── */
  @media (prefers-reduced-motion: reduce) {
    .anim-title__chars { animation: none !important; opacity: 0; }
    .anim-title__char { animation: none !important; opacity: 1; transform: none; }
    .anim-title__gradient {
      animation: none !important;
      opacity: 1;
      filter: none;
    }
  }
`;

export default function AnimatedTitle({
  text = 'CompEng Portal',
  as: Tag = 'h1',
  fontSize = 22,
  stagger = 55,
  className = '',
  style = {},
}) {
  const chars = Array.from(text);

  return (
    <Tag
      className={`anim-title ${className}`.trim()}
      style={{ fontSize, ...style }}
      aria-label={text}
    >
      <style>{STYLES}</style>

      {/* Per-character entrance layer */}
      <span className="anim-title__chars" aria-hidden="true">
        {chars.map((c, i) => (
          <span
            key={i}
            className="anim-title__char"
            style={{ '--delay': `${i * stagger}ms` }}
          >
            {c === ' ' ? '\u00A0' : c}
          </span>
        ))}
      </span>

      {/* Gradient layer — fades in after the cascade */}
      <span className="anim-title__gradient" aria-hidden="true">
        {text}
      </span>
    </Tag>
  );
}