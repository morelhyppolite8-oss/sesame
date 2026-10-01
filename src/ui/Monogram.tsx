/** Monogramme « H » : fin cercle doré et initiale en serif. */
export function Monogram({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="30.5" fill="none" stroke="var(--gold)" strokeWidth="1" />
      <circle cx="32" cy="32" r="26.5" fill="none" stroke="var(--gold)" strokeOpacity="0.35" strokeWidth="0.75" />
      <text
        x="32"
        y="42.5"
        textAnchor="middle"
        fontFamily="Cormorant Garamond, serif"
        fontSize="30"
        fontWeight="500"
        fill="var(--gold)"
      >
        H
      </text>
    </svg>
  );
}
