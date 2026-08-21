/**
 * Brand marks for the connectors listed on the Sources page.
 *
 * Inline SVG for the same reason `google-drive-logo.tsx` is: a handful of paths
 * costs less than a network request each, and the mark scales with the text.
 *
 * These are *simplified* marks drawn to be recognisable at 32px, not the
 * vendors' official assets — those come from each brand kit and should replace
 * these if the page is ever shown outside a demo. Each keeps its own colours,
 * because a brand mark tinted to our palette reads as our icon rather than
 * theirs.
 */
interface LogoProps {
  className?: string;
}

/** Microsoft SharePoint: the two overlapping discs of the Office family. */
export function SharePointLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-label="SharePoint">
      <circle cx="19" cy="15" r="11" fill="#036C70" />
      <circle cx="30" cy="24" r="11" fill="#1A9BA1" />
      <circle cx="21" cy="34" r="10" fill="#37C6D0" />
      <path
        d="M11 18h13a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2V20a2 2 0 0 1 2-2Z"
        fill="#03787C"
      />
      <text
        x="17.5"
        y="31"
        textAnchor="middle"
        fill="#fff"
        fontSize="12"
        fontFamily="system-ui, sans-serif"
        fontWeight="600"
      >
        S
      </text>
    </svg>
  );
}

/** Amazon S3: the bucket silhouette in the service's orange-red. */
export function AmazonS3Logo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-label="Amazon S3">
      <path d="M10 12h28l-3 26a2 2 0 0 1-2 1.8H15a2 2 0 0 1-2-1.8L10 12Z" fill="#E25444" />
      <path d="M24 12h14l-3 26a2 2 0 0 1-2 1.8h-9V12Z" fill="#7B1D13" opacity=".35" />
      <ellipse cx="24" cy="12" rx="14" ry="3.6" fill="#F58536" />
      <path
        d="M20 22c0-1.4 1.6-2.4 4-2.4s4 1 4 2.4-1.4 2-4 2.6-4 1.2-4 2.6 1.6 2.4 4 2.4 4-1 4-2.4"
        fill="none"
        stroke="#fff"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Azure Blob Storage: the Azure chevron. */
export function AzureBlobLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-label="Azure Blob Storage">
      <defs>
        <linearGradient id="azure-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#32BEDD" />
          <stop offset="1" stopColor="#0078D4" />
        </linearGradient>
      </defs>
      <path d="M18 6h12l12 24-9 12H15l9-12H12L18 6Z" fill="url(#azure-a)" />
      <path d="M24 30h9l-9 12H15l9-12Z" fill="#0062AD" opacity=".55" />
    </svg>
  );
}

/** Google Cloud Storage: the Cloud family's four-colour hexagon-ish mark. */
export function GoogleCloudStorageLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-label="Google Cloud Storage">
      <path d="M24 6 38 14v10L24 16 10 24V14L24 6Z" fill="#4285F4" />
      <path d="M38 14v10L24 16l14-2Z" fill="#EA4335" />
      <path d="M10 26h28v6H10z" fill="#FBBC04" />
      <path d="M10 34h28v6H10z" fill="#34A853" />
      <circle cx="15" cy="29" r="1.6" fill="#fff" />
      <circle cx="15" cy="37" r="1.6" fill="#fff" />
    </svg>
  );
}

/** Dropbox: the four-quadrilateral box. */
export function DropboxLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-label="Dropbox">
      <path d="M14 8 4 15l10 7 10-7-10-7Z" fill="#0061FF" />
      <path d="M34 8 24 15l10 7 10-7-10-7Z" fill="#0061FF" />
      <path d="M4 29l10-7 10 7-10 7-10-7Z" fill="#0061FF" />
      <path d="M34 22l10 7-10 7-10-7 10-7Z" fill="#0061FF" />
      <path d="M14 38l10-6.5 10 6.5-10 6-10-6Z" fill="#0F5FD8" />
    </svg>
  );
}
