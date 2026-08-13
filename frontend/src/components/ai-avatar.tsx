import { useId } from 'react';

/**
 * The signed-in account's portrait: a flat illustrated figure with the same
 * spark the assistant wears elsewhere in the app.
 *
 * Drawn rather than sourced. Everything here is sized for 36px, which is where
 * it actually appears — the badge's star has deliberately thick, concave arms
 * because a thin four-pointed star turns to mush at that size, and the face
 * carries only three marks for the same reason. Checked at 36px rather than
 * designed at 96 and hoped for.
 */
export function AiAvatar({ className }: { className?: string }) {
  // The gradient and the clip are referenced by id, and an id is global to the
  // document — two of these on one page would have the second silently reuse
  // the first's definitions.
  const uid = useId().replace(/:/g, '');
  const sky = `sky-${uid}`;
  const disc = `disc-${uid}`;

  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-hidden="true">
      <defs>
        <linearGradient id={sky} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#dbe4ff" />
          <stop offset="1" stopColor="#ede4ff" />
        </linearGradient>
        <clipPath id={disc}>
          <circle cx="32" cy="32" r="32" />
        </clipPath>
      </defs>

      {/* The figure is clipped to the disc so the shoulders can run past the
          bottom edge — a portrait ends at its frame rather than floating. */}
      <g clipPath={`url(#${disc})`}>
        <rect width="64" height="64" fill={`url(#${sky})`} />

        <path
          d="M32 43.5c-12 0-21.8 9-21.8 20.1V64h43.6v-0.4C53.8 52.5 44 43.5 32 43.5z"
          fill="#4f46e5"
        />
        <path
          d="M27 45 32 52l5-7"
          fill="none"
          stroke="#e6e9ff"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <path d="M27.8 33.5h8.4v8.2a4.2 4.2 0 0 1-8.4 0z" fill="#e3a97f" />
        <ellipse cx="32" cy="25" rx="10" ry="11.2" fill="#f4cba8" />
        <path
          d="M32 13.4c6 0 10.4 4.6 10.4 11.2 0 1.1-.1 2-.3 2.8-.5-3.6-1.6-5.6-3.4-6.4-3.4 1.5-10.6 1.6-14.2-.2-1.6 1-2.5 3-2.9 6.6-.2-.8-.3-1.7-.3-2.8 0-6.6 4.7-11.2 10.7-11.2z"
          fill="#39324f"
        />

        <circle cx="28.3" cy="25.8" r="1.45" fill="#2b2740" />
        <circle cx="35.7" cy="25.8" r="1.45" fill="#2b2740" />
        <path
          d="M29.5 30.2a3.3 3.3 0 0 0 5 0"
          fill="none"
          stroke="#c98d63"
          strokeWidth="1.35"
          strokeLinecap="round"
        />
      </g>

      {/* Outside the clip: the badge sits on the rim, and a white ring holds it
          off whatever it overlaps. */}
      <circle cx="47" cy="47" r="12" fill="#fff" />
      <circle cx="47" cy="47" r="10" fill="#7c3aed" />
      <path
        d="M47 40.2c.75 3.75 2.3 5.3 6.05 6.05-3.75.75-5.3 2.3-6.05 6.05-.75-3.75-2.3-5.3-6.05-6.05 3.75-.75 5.3-2.3 6.05-6.05z"
        fill="#fff"
      />
    </svg>
  );
}
