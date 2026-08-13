/**
 * The eCloudvalley cloud, redrawn.
 *
 * `ecv-mark.png` was the full logo cropped to a square, and the crop cut
 * through the artwork: the cloud ran off all four edges and a slice of the blue
 * cloud behind the wordmark hung in the top right, unattached to anything. At
 * 36px in a round frame it read as a bitmap accident rather than a mark.
 *
 * Drawn rather than re-cropped so it is centred by construction, stays sharp on
 * a high-density screen, and carries its own padding — a round frame can clip
 * it without eating into the shape.
 */

/** The brand orange, taken from the logo artwork rather than the app palette. */
const ORANGE = '#ef7f24';

export function EcvMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="eCloudvalley">
      {/* One fill, four overlapping shapes: a cloud is a silhouette, so the
          pieces need no boolean union to read as one body.

          Everything stays inside a circle of radius ~24 about the centre. The
          caller clips this to a round frame, and a cloud drawn to the full
          width of the viewBox loses both its shoulders to that mask. */}
      <g fill={ORANGE}>
        <circle cx="32" cy="29" r="12" />
        <circle cx="21" cy="35" r="8" />
        <circle cx="44" cy="35" r="8" />
        <rect x="13" y="33" width="38" height="13" rx="6.5" />
      </g>

      {/* The lowercase "e", as one stroked path: the bar, then an arc that runs
          the long way round and stops short at four o'clock to leave the
          letter's opening. */}
      <path
        d="M 25.5 31 H 38.5 A 6.5 6.5 0 1 0 36.6 35.6"
        fill="none"
        stroke="#fff"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}
