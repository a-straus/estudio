import "./WordEntry.css";

/** The word data every word-bearing component shares. */
export interface WordEntryData {
  /** Encountered form — always shown. */
  headword: string;
  /** Lemma; rendered after an em dash when it differs from the headword. */
  lemma?: string;
  /** Language tag, e.g. "ES" or "EN". */
  language?: string;
  /** Part of speech, e.g. "sustantivo". */
  partOfSpeech?: string;
  /** CEFR level, e.g. "C1". */
  level?: string;
  /** Spanish monolingual definition (learner text, serif). */
  glossEs?: string;
  /** English gloss (app voice, sans). */
  glossEn?: string;
  /** Example sentence in the studied language. */
  example?: string;
}

export type WordEntrySize = "hero" | "full" | "compact";
export type GlossReveal = "es" | "en" | "both";

interface WordEntryProps extends WordEntryData {
  size: WordEntrySize;
  /** Which definition line(s) to show in `full` (Settings preference; default both). */
  reveal?: GlossReveal;
}

/**
 * WordEntry — the signature object. The dictionary-entry rendering of a word;
 * every other component that shows a word composes this. Static: no hover,
 * no color, no animation of its own.
 */
export function WordEntry({
  headword,
  lemma,
  language,
  partOfSpeech,
  level,
  glossEs,
  glossEn,
  example,
  size,
  reveal = "both",
}: WordEntryProps) {
  const showLemma = size !== "compact" && lemma && lemma !== headword;
  const tagline =
    size === "compact"
      ? (level ?? "")
      : [language, partOfSpeech, level].filter(Boolean).join(" · ");

  let esLine: string | undefined;
  let enLine: string | undefined;
  if (size === "full") {
    if (reveal === "both") {
      esLine = glossEs;
      enLine = glossEn;
    } else if (reveal === "es") {
      esLine = glossEs ?? undefined;
      enLine = glossEs ? undefined : glossEn;
    } else {
      enLine = glossEn ?? undefined;
      esLine = glossEn ? undefined : glossEs;
    }
  } else if (size === "compact") {
    enLine = glossEn;
  }

  return (
    <div className={`word-entry word-entry--${size}`}>
      <span className="word-entry__headword">
        {headword}
        {showLemma && (
          <>
            {" — "}
            <span className="word-entry__lemma">{lemma}</span>
          </>
        )}
      </span>
      {tagline && <span className="word-entry__tagline">{tagline}</span>}
      {size === "full" && esLine && (
        <span className="word-entry__gloss word-entry__gloss--es">
          {esLine}
        </span>
      )}
      {enLine && <span className="word-entry__gloss">{enLine}</span>}
      {size === "full" && example && (
        <span className="word-entry__example">{example}</span>
      )}
    </div>
  );
}
