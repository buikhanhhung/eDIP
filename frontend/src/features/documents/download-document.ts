import { apiClient } from '@/lib/api-client';

/**
 * The session token lives in localStorage and is attached by an axios
 * interceptor, so a plain `<a href>` to the download route navigates without
 * an Authorization header and the API answers 403. Fetch the bytes through the
 * same client every other call uses, then hand the browser a blob to save.
 */
export async function downloadDocument(id: string, filename: string): Promise<void> {
  const response = await apiClient.get<Blob>(`/documents/${id}/download`, {
    responseType: 'blob',
  });

  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;

  // The anchor has to be in the document for Chromium to treat the click as a
  // download rather than ignore it, and the blob URL has to outlive the save —
  // revoking it on the next tick cancels the download mid-write.
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
