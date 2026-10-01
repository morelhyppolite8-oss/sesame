/** Emblème de Sésame : une clé ancienne dans un double cercle doré. */
export function Monogram({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="30.5" fill="none" stroke="var(--gold)" strokeWidth="1" />
      <circle cx="32" cy="32" r="26.5" fill="none" stroke="var(--gold)" strokeOpacity="0.35" strokeWidth="0.75" />
      <g fill="none" stroke="var(--gold)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" transform="translate(31 33) scale(1.22) translate(-31 -33)">
        <circle cx="23" cy="32" r="6.5" />
        <circle cx="23" cy="32" r="2.6" strokeWidth="1.2" />
        <path d="M29.5 32H46 M40.5 32v5 M45.5 32v3.5" />
      </g>
    </svg>
  );
}
