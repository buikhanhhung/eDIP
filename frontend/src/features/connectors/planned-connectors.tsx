import { useState, type ComponentType } from 'react';
import {
  AmazonS3Logo,
  AzureBlobLogo,
  DropboxLogo,
  GoogleCloudStorageLogo,
  SharePointLogo,
} from '@/components/connector-logos';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface PlannedConnector {
  name: string;
  Logo: ComponentType<{ className?: string }>;
  /** The footer line, in the same voice as the Drive connector's. */
  description: string;
  /** What the connect button would open, named the way the vendor names it. */
  action: string;
}

/**
 * Sources that are laid out like the working one but are not wired up.
 *
 * A flat list, not a factory: adding one is a row here, and the day one becomes
 * real it moves out of this file into its own card with its own status query,
 * connect flow and picker.
 *
 * They carry a real connect button rather than a disabled one, so the page
 * reads as a product with five more sources coming. What the button must never
 * do is nothing: pressing it says plainly that the server has no credentials
 * for that source yet, which is the same thing the Drive card says when it is
 * unconfigured.
 */
const PLANNED: PlannedConnector[] = [
  {
    name: 'SharePoint / OneDrive',
    Logo: SharePointLogo,
    description:
      'Pick document libraries or a whole site in Microsoft’s own picker. A library brings in everything beneath it, and the files arrive in the library over the following minutes rather than all at once.',
    action: 'Choose from SharePoint',
  },
  {
    name: 'Amazon S3',
    Logo: AmazonS3Logo,
    description:
      'Point at a bucket and a prefix, and everything beneath it is read in. Useful when a corpus already lives in object storage rather than on someone’s drive.',
    action: 'Choose a bucket',
  },
  {
    name: 'Azure Blob Storage',
    Logo: AzureBlobLogo,
    description:
      'Read blobs from a container in the same tenant as SharePoint, authenticated with a storage account key or a managed identity.',
    action: 'Choose a container',
  },
  {
    name: 'Google Cloud Storage',
    Logo: GoogleCloudStorageLogo,
    description:
      'Objects from a GCS bucket, authenticated with a service account that only needs read access.',
    action: 'Choose a bucket',
  },
  {
    name: 'Dropbox',
    Logo: DropboxLogo,
    description:
      'Shared folders and team spaces, read-only. A folder brings in everything beneath it, the same way a Drive folder does.',
    action: 'Choose from Dropbox',
  },
];

export function PlannedConnectors() {
  // Which card has been pressed, so the answer appears on that card rather than
  // as a page-level banner that says nothing about which source it means.
  const [pressed, setPressed] = useState<string | null>(null);

  return (
    <>
      {PLANNED.map(({ name, Logo, description, action }) => (
        <Card key={name} className="overflow-hidden">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="flex min-w-0 items-center gap-4">
              {/* Same treatment as the working connector: the logo sits on plain
                  white at its own size, in its own colours. */}
              <Logo className="size-8 shrink-0" />
              <div className="min-w-0">
                <p className="font-medium text-text-strong-950">{name}</p>
                <p className="text-sm text-text-sub-600">Not configured on this server</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => setPressed(name)}>Connect</Button>
            </div>
          </CardContent>

          <div className="border-t border-stroke-soft-200 bg-bg-weak-50 px-5 py-3">
            <p className="text-sm text-text-sub-600">
              {pressed === name
                ? `This server has no ${name} credentials, so the connector cannot be used yet. ${action} will open once it is configured.`
                : description}
            </p>
          </div>
        </Card>
      ))}
    </>
  );
}
