const STYLES = `
  .anim-footer {
    text-align: center;
    font-size: 12px;
    letter-spacing: 0.02em;
    line-height: 1.6;
    padding-bottom: 8px;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  }

  .anim-footer__row {
    display: inline-flex;
    align-items: baseline;
    justify-content: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .anim-footer__item {
    display: inline-block;
    color: rgba(203, 213, 225, 0.75);
    opacity: 0;
    transform: translateY(8px);
    animation: anim-footer-item-in 600ms cubic-bezier(0.2, 0.8, 0.2, 1)
      var(--delay, 0ms) forwards;
    will-change: transform, opacity;
  }

  .anim-footer__year {
    font-variant-numeric: tabular-nums;
    font-weight: 500;
  }

  .anim-footer__name {
    position: relative;
    display: inline-block;
    font-weight: 600;
  }

  .anim-footer__name-white {
    color: rgba(255, 255, 255, 0.95);
    animation: anim-footer-white-out 400ms ease 3300ms forwards;
  }

  .anim-footer__name-gradient {
    position: absolute;
    inset: 0;
    display: inline-block;
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
      anim-footer-flow 8s linear infinite,
      anim-footer-fade-in 600ms ease 2900ms forwards;
    pointer-events: none;
    white-space: nowrap;
  }

  @keyframes anim-footer-item-in {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  @keyframes anim-footer-white-out {
    from { opacity: 1; }
    to   { opacity: 0; }
  }

  @keyframes anim-footer-fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  @keyframes anim-footer-flow {
    0%   { background-position: 0% 50%; }
    100% { background-position: 300% 50%; }
  }

  @media (prefers-reduced-motion: reduce) {
    .anim-footer__item {
      animation: none !important;
      opacity: 1;
      transform: none;
    }
    .anim-footer__name-white {
      animation: none !important;
      opacity: 0;
    }
    .anim-footer__name-gradient {
      animation: none !important;
      opacity: 1;
    }
  }
`;

export default function AnimatedFooter({
  year = new Date().getFullYear(),
  name = 'CLEMENT PEAMBA SUMNI',
}) {
  const plainText = `© ${year} — Developed by ${name}`;

  return (
    <footer className="anim-footer" aria-label={plainText}>
      <style>{STYLES}</style>
      <div className="anim-footer__row">
        <span
          className="anim-footer__item"
          style={{ '--delay': '2400ms' }}
          aria-hidden="true"
        >
          ©
        </span>
        <span
          className="anim-footer__item anim-footer__year"
          style={{ '--delay': '2480ms' }}
          aria-hidden="true"
        >
          {year}
        </span>
        <span
          className="anim-footer__item"
          style={{ '--delay': '2560ms' }}
          aria-hidden="true"
        >
          —
        </span>
        <span
          className="anim-footer__item"
          style={{ '--delay': '2640ms' }}
          aria-hidden="true"
        >
          Developed by
        </span>
        <span
          className="anim-footer__item anim-footer__name"
          style={{ '--delay': '2720ms' }}
          aria-hidden="true"
        >
          <span className="anim-footer__name-white">{name}</span>
          <span className="anim-footer__name-gradient">{name}</span>
        </span>
      </div>
    </footer>
  );
}