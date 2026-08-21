/**
 * Sentence boundaries, for the one strategy that needs to embed a sentence at a
 * time.
 *
 * The boundary is punctuation *followed by whitespace*, which is what keeps a
 * Vietnamese amount intact: `1.850.000` has no space after its separators, so
 * it is never a boundary. Abbreviations do have one — `TP. Hồ Chí Minh` — so a
 * fragment too short to be a sentence is folded into its neighbour rather than
 * embedded on its own.
 */
const BOUNDARY = /(?<=[.!?])\s+/;

/**
 * Below this, a fragment is an abbreviation or an ordinal rather than a
 * sentence. Long enough to catch `TP.` and `v.v.`, short enough to leave a
 * terse real sentence alone.
 */
const MIN_SENTENCE_CHARS = 12;

/**
 * Abbreviations that end in a period and are followed by a capitalised word, so
 * the boundary rule sees a sentence end where there is none. Folding a short
 * fragment forward only helps when the abbreviation stands alone — in
 * `Công ty đặt tại TP. Hồ Chí Minh` the fragment before the period is a long
 * one, so the abbreviation itself has to be recognised.
 *
 * Deliberately short: these are the ones that occur in this corpus. An
 * abbreviation not listed here costs a sentence boundary in the wrong place,
 * which shifts a chunk edge and loses nothing.
 */
const ENDS_WITH_ABBREVIATION = /(?:^|\s)(?:TP|Tp|TS|ThS|PGS|GS|KS|Q|P|Đ|tr|v\.v)\.$/;

export function splitSentences(text: string, minChars = MIN_SENTENCE_CHARS): string[] {
  const pieces = text
    .split(BOUNDARY)
    .map((piece) => piece.trim())
    .filter((piece) => piece.length > 0);

  const sentences: string[] = [];
  // A short fragment with nothing before it belongs to what follows, not to
  // what precedes it — `TS. Nguyễn Văn A ...` opens a sentence.
  let pending = '';

  for (const piece of pieces) {
    const previous = sentences[sentences.length - 1];

    // The period that ended the previous piece belongs to an abbreviation, so
    // this piece continues that sentence rather than starting one.
    if (previous !== undefined && ENDS_WITH_ABBREVIATION.test(previous)) {
      sentences[sentences.length - 1] = `${previous} ${piece}`;
      continue;
    }

    if (piece.length < minChars) {
      if (previous === undefined) {
        pending = pending ? `${pending} ${piece}` : piece;
      } else {
        sentences[sentences.length - 1] = `${previous} ${piece}`;
      }
      continue;
    }

    sentences.push(pending ? `${pending} ${piece}` : piece);
    pending = '';
  }

  // A document that is nothing but short fragments still has to come back.
  if (pending) sentences.push(pending);

  return sentences;
}

/** Cosine similarity, on vectors the provider has already normalised. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dot / magnitude;
}
