import { allowedTypeFor } from '@infrastructure/storage/allowlist';

/** The shape Drive returns from `files.list` with the fields this asks for. */
export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
}

export const FOLDER_MIME = 'application/vnd.google-apps.folder';

/**
 * Google-native documents hold no bytes to download — `files.get?alt=media`
 * fails on them and `files.export` is the only way out.
 *
 * The export targets are the Office formats, which the extraction pipeline
 * reads including their tables and embedded pictures. Exporting a Doc to plain
 * text would be simpler and would throw away every table in it.
 */
const EXPORT_TARGETS: Record<string, { mimeType: string; extension: string }> = {
  'application/vnd.google-apps.document': {
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extension: 'docx',
  },
  'application/vnd.google-apps.spreadsheet': {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extension: 'xlsx',
  },
  'application/vnd.google-apps.presentation': {
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    extension: 'pptx',
  },
};

export type ImportPlan =
  | { action: 'download'; filename: string }
  | { action: 'export'; filename: string; exportMimeType: string }
  | { action: 'skip'; reason: string };

/**
 * What to do with one Drive entry, decided before any network call so a
 * selection can be shown as it will be treated.
 */
export function planImport(file: DriveFile): ImportPlan {
  if (file.mimeType === FOLDER_MIME) {
    return { action: 'skip', reason: 'Folder' };
  }

  const exportTarget = EXPORT_TARGETS[file.mimeType];
  if (exportTarget) {
    return {
      action: 'export',
      // Drive omits the extension from a native document's name, and the
      // pipeline decides how to read a file by its extension alone.
      filename: `${stripExtension(file.name)}.${exportTarget.extension}`,
      exportMimeType: exportTarget.mimeType,
    };
  }

  if (file.mimeType.startsWith('application/vnd.google-apps.')) {
    return { action: 'skip', reason: 'Google format with no document equivalent' };
  }

  // The extension decides, exactly as it does for an upload, so a file cannot
  // be accepted here that the extractor would then refuse.
  if (!allowedTypeFor(file.name)) {
    return { action: 'skip', reason: 'Unsupported file type' };
  }

  return { action: 'download', filename: file.name };
}

function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/, '') || name;
}

/** Drive's query language, escaped. A stray quote would rewrite the query. */
export function folderQuery(folderId: string): string {
  return `'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false`;
}
