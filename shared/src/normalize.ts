/**
 * Normalize a term for matching: lowercase + accent-strip.
 * Used for the `term_normalized` / `lemma_normalized` columns and dedupe
 * lookups only — stored text always keeps its accents.
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .normalize("NFC");
}
