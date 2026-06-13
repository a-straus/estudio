// Project Gutenberg ingestion — URL/ID resolution, license-boilerplate
// stripping, and a local token-reduction pre-pass. Everything here is a PURE
// function of its input so the ingestion job can re-derive candidate batches
// from the stored book text on every run (including resume).
//
// IMPORTANT: the pre-pass is a TOKEN-COST OPTIMIZATION ONLY. It cheaply drops
// obvious non-candidates (stopwords, archaic function words, proper-noun-ish
// tokens) so fewer words are sent to the LLM. It is NEVER the semantic filter:
// the archaic-aware LLM rubric is. Over-keeping is fine — a word the pre-pass
// keeps but the LLM would drop costs a little, but never a wrong answer.

/**
 * Resolve a bare ebook id ("10"), an ebooks URL
 * ("https://www.gutenberg.org/ebooks/10"), or a direct plain-text URL to the
 * canonical UTF-8 plain-text fetch URL. Returns null when the input names no
 * resolvable Gutenberg book.
 */
export function resolveGutenbergUrl(input: string): string | null {
  const ref = input.trim();
  if (ref === "") return null;

  // A bare numeric id.
  if (/^\d+$/.test(ref)) {
    return `https://www.gutenberg.org/ebooks/${ref}.txt.utf-8`;
  }

  // An ebooks/files URL (with or without scheme) carrying the id — normalize to
  // the canonical plain-text URL (checked before the bare-.txt passthrough so a
  // "/files/10/10-0.txt" link resolves by id rather than being used verbatim).
  const match = ref.match(/gutenberg\.org\/(?:ebooks|files)\/(\d+)/i);
  if (match) {
    return `https://www.gutenberg.org/ebooks/${match[1]}.txt.utf-8`;
  }

  // Any other direct .txt link (e.g. /cache/epub/<id>/pg<id>.txt) — use as-is.
  if (/^https?:\/\/\S+\.txt(\.utf-8)?$/i.test(ref)) return ref;

  return null;
}

/**
 * Derive a book title from the Gutenberg header `Title:` line when present,
 * else fall back to the supplied ref. Cheap — no network.
 */
export function deriveGutenbergTitle(text: string, fallbackRef: string): string {
  const match = text.match(/^\s*Title:\s*(.+?)\s*$/im);
  return match ? match[1].trim() : fallbackRef;
}

/**
 * Strip the Project Gutenberg license header/footer. The body sits between the
 * `*** START OF …` and `*** END OF …` markers; when either is missing we keep
 * what we have rather than discarding the book.
 */
export function stripGutenbergBoilerplate(text: string): string {
  let body = text;
  const start = body.match(/\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG[^*]*\*\*\*/i);
  if (start && start.index !== undefined) {
    body = body.slice(start.index + start[0].length);
  }
  const end = body.match(/\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG[^*]*\*\*\*/i);
  if (end && end.index !== undefined) {
    body = body.slice(0, end.index);
  }
  return body.trim();
}

// Very-high-frequency English function words / stopwords. Dropping these cuts
// the bulk of the token cost; the list is intentionally common-words-only.
const STOPWORDS = new Set<string>([
  "the", "a", "an", "and", "or", "but", "if", "then", "than", "so", "as",
  "of", "to", "in", "on", "at", "by", "for", "with", "from", "into", "onto",
  "up", "down", "out", "off", "over", "under", "again", "further",
  "is", "am", "are", "was", "were", "be", "been", "being", "do", "does", "did",
  "have", "has", "had", "having", "will", "would", "shall", "should", "can",
  "could", "may", "might", "must", "ought",
  "i", "me", "my", "mine", "myself", "we", "us", "our", "ours", "ourselves",
  "you", "your", "yours", "yourself", "yourselves", "he", "him", "his",
  "himself", "she", "her", "hers", "herself", "it", "its", "itself", "they",
  "them", "their", "theirs", "themselves", "this", "that", "these", "those",
  "who", "whom", "whose", "which", "what", "where", "when", "why", "how",
  "all", "any", "both", "each", "few", "more", "most", "other", "some", "such",
  "no", "nor", "not", "only", "own", "same", "too", "very", "just", "now",
  "here", "there", "also", "about", "after", "before", "between", "through",
  "during", "above", "below", "because", "while", "until", "upon", "yet",
  "him", "one", "two", "three", "many", "much", "every", "said", "say", "says",
  "come", "came", "go", "went", "gone", "make", "made", "see", "saw", "seen",
  "let", "thus", "even", "ever", "never", "like", "well", "back", "still",
]);

// Archaic FUNCTION words and mere spelling/inflection variants — noise per the
// GOAL §6.1 rubric. Genuinely difficult archaic VOCABULARY (concupiscence,
// propitiation, raiment, habergeon…) is NOT here — it must reach the LLM.
const ARCHAIC_FUNCTION_WORDS = new Set<string>([
  "thee", "thou", "thy", "thine", "ye", "doth", "dost", "hath", "hast",
  "unto", "saith", "shalt", "shall", "wilt", "wouldst", "shouldst", "couldst",
  "art", "wast", "wert", "hither", "thither", "whither", "hence", "thence",
  "whence", "yea", "nay", "verily", "behold", "lo", "aforetime", "betwixt",
  "ere", "oft", "perchance", "prithee", "methinks", "anon", "wherefore",
  "whereof", "whereunto", "thereof", "therein", "thereto", "therewith",
  "wherein", "whereby", "henceforth", "forasmuch", "notwithstanding",
]);

/** A short archaic-suffix test for verb inflections (-eth/-est) we treat as noise. */
function isArchaicInflection(word: string): boolean {
  // e.g. "walketh", "doeth", "knowest", "comest" — strip the suffix and the
  // stem is an ordinary word. Kept deliberately loose; over-dropping a real
  // candidate here is acceptable (the LLM is the real filter, not this).
  return /(eth|est)$/.test(word) && word.length > 4;
}

/**
 * Unique lowercased candidate word types from the book text, in order of first
 * appearance. Drops stopwords, archaic function words / -eth/-est inflections,
 * and proper-noun-ish tokens (capitalized mid-sentence, not sentence-initial).
 * Over-keeping is fine; this only reduces tokens, it never decides difficulty.
 */
export function prepassCandidates(text: string): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();

  // Walk word tokens with their offsets so we can tell sentence-initial
  // capitalization (ordinary) from mid-sentence capitalization (proper-noun-ish).
  const wordRe = /[A-Za-z][A-Za-z'-]*/g;
  let match: RegExpExecArray | null;
  let prevEnd = -1;
  let prevChar = "";
  while ((match = wordRe.exec(text)) !== null) {
    const raw = match[0];
    const start = match.index;
    const lower = raw.toLowerCase();

    // Single-letter tokens are never candidates.
    if (raw.length < 2) {
      prevEnd = wordRe.lastIndex;
      prevChar = text[prevEnd - 1] ?? "";
      continue;
    }

    // Proper-noun heuristic: a capitalized word that is NOT at the start of a
    // sentence is probably a name/place. "Sentence start" = preceded by ./!/?/
    // newline/nothing (allowing intervening quotes/space).
    const isCapitalized = raw[0] >= "A" && raw[0] <= "Z";
    const between = prevEnd >= 0 ? text.slice(prevEnd, start) : "";
    const atSentenceStart =
      prevEnd < 0 || /[.!?:;]/.test(prevChar) || /[.!?\n]/.test(between);
    const properNounish = isCapitalized && !atSentenceStart;

    prevEnd = wordRe.lastIndex;
    prevChar = text[prevEnd - 1] ?? "";

    if (properNounish) continue;
    if (STOPWORDS.has(lower)) continue;
    if (ARCHAIC_FUNCTION_WORDS.has(lower)) continue;
    if (isArchaicInflection(lower)) continue;
    if (seen.has(lower)) continue;

    seen.add(lower);
    candidates.push(lower);
  }
  return candidates;
}
