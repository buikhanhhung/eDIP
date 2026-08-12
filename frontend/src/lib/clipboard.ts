/**
 * Copies text, reporting whether it worked.
 *
 * The Clipboard API is refused often enough to plan for — an unfocused
 * document, a permission the browser never granted — so a failure falls back to
 * the older selection-based copy. Callers are expected to show the result:
 * a copy button that silently does nothing is the outcome that makes a reader
 * press it again and again.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return copyBySelection(text);
  }
}

/**
 * The pre-Clipboard-API route: put the text in an off-screen field, select it,
 * and let the browser's own copy command take it. Deprecated, and still the
 * only thing that works when the Clipboard API is refused.
 */
function copyBySelection(text: string): boolean {
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.left = '-9999px';
  document.body.appendChild(field);

  try {
    field.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    field.remove();
  }
}
