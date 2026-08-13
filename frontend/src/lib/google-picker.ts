/**
 * Google's own file picker, loaded on demand.
 *
 * The script comes from Google and is the only third-party code this app runs,
 * so it is fetched when someone actually presses the button rather than on
 * every page load. The promise is cached: a second press reuses the loaded
 * library instead of appending another script tag.
 *
 * Typed narrowly here rather than pulled in from `@types/google.picker`. Four
 * builder methods and one callback shape is the whole surface this uses, and a
 * hand-written interface for them says what is expected far more plainly than
 * a dependency covering the entire API would.
 */

const GAPI_SRC = 'https://apis.google.com/js/api.js';

export interface PickedEntry {
  id: string;
  name: string;
  mimeType: string;
}

export interface PickerConfig {
  clientId: string;
  apiKey: string;
  accessToken: string;
}

interface PickerBuilder {
  setDeveloperKey(key: string): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  addView(view: unknown): PickerBuilder;
  enableFeature(feature: string): PickerBuilder;
  setCallback(callback: (data: PickerCallbackData) => void): PickerBuilder;
  build(): { setVisible(visible: boolean): void };
}

interface DocsView {
  setIncludeFolders(include: boolean): DocsView;
  setSelectFolderEnabled(enabled: boolean): DocsView;
  setMode(mode: string): DocsView;
}

interface PickerCallbackData {
  action: string;
  docs?: PickedEntry[];
}

interface PickerNamespace {
  PickerBuilder: new () => PickerBuilder;
  DocsView: new (viewId?: string) => DocsView;
  ViewId: { DOCS: string };
  DocsViewMode: { LIST: string };
  Feature: { MULTISELECT_ENABLED: string };
  Action: { PICKED: string; CANCEL: string };
}

declare global {
  interface Window {
    gapi?: { load(name: string, callback: () => void): void };
    google?: { picker?: PickerNamespace };
  }
}

let loading: Promise<PickerNamespace> | null = null;

function loadPicker(): Promise<PickerNamespace> {
  if (loading) return loading;

  loading = new Promise<PickerNamespace>((resolve, reject) => {
    const done = () => {
      if (!window.gapi) {
        reject(new Error('Google’s script loaded but exposed no API.'));
        return;
      }
      window.gapi.load('picker', () => {
        const picker = window.google?.picker;
        if (picker) resolve(picker);
        else reject(new Error('The Google Picker library did not load.'));
      });
    };

    if (window.gapi) {
      done();
      return;
    }

    const script = document.createElement('script');
    script.src = GAPI_SRC;
    script.async = true;
    script.onload = done;
    // A blocked or offline load must not leave the promise pending forever,
    // or the button stays on "Opening…" with nothing to explain it.
    script.onerror = () => {
      loading = null;
      reject(new Error('Could not reach Google to load the file picker.'));
    };
    document.head.append(script);
  });

  return loading;
}

/**
 * Opens the picker and resolves with what was chosen.
 *
 * Folders are selectable, not just browsable: picking one means "everything in
 * it", which the server expands. Cancelling resolves with an empty list rather
 * than rejecting — a person changing their mind is not an error.
 */
export async function openDrivePicker(config: PickerConfig): Promise<PickedEntry[]> {
  const picker = await loadPicker();

  return new Promise<PickedEntry[]>((resolve) => {
    const view = new picker.DocsView(picker.ViewId.DOCS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true)
      .setMode(picker.DocsViewMode.LIST);

    new picker.PickerBuilder()
      .setDeveloperKey(config.apiKey)
      .setOAuthToken(config.accessToken)
      .addView(view)
      .enableFeature(picker.Feature.MULTISELECT_ENABLED)
      .setCallback((data) => {
        if (data.action === picker.Action.PICKED) resolve(data.docs ?? []);
        else if (data.action === picker.Action.CANCEL) resolve([]);
      })
      .build()
      .setVisible(true);
  });
}
