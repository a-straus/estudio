import { Fragment } from "react";
import type { WordLanguage } from "@estudio/shared";
import { useQuickAdd } from "./QuickAddContext";
import "./TappableText.css";

const LETTER_RE = /[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/;
const STRIP_LEADING = /^[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]+/;
const STRIP_TRAILING = /[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]+$/;

function cleanToken(token: string): string {
  return token.replace(STRIP_LEADING, "").replace(STRIP_TRAILING, "");
}

interface TappableTextProps {
  text: string;
  language: WordLanguage;
}

/**
 * TappableText — wraps app-rendered reading text so each word is tappable to
 * pre-fill the QuickAdd modal (cascade learning, D4 §TappableText). Inherits
 * all host typography; adds no decoration until hover/focus.
 */
export function TappableText({ text, language }: TappableTextProps) {
  const { openQuickAdd } = useQuickAdd();

  // Split on whitespace-runs, keeping the separators as tokens
  const tokens = text.split(/(\s+)/);

  return (
    <>
      {tokens.map((token, i) => {
        if (!token) return null;

        // Whitespace-only token — render as-is to preserve spacing
        if (/^\s+$/.test(token)) {
          return <Fragment key={i}>{token}</Fragment>;
        }

        // Word token (contains at least one letter) — make interactive
        if (LETTER_RE.test(token)) {
          const clean = cleanToken(token);
          const activate = () => {
            if (clean) openQuickAdd(clean, language);
          };
          return (
            <button
              key={i}
              type="button"
              className="tappable-text__word"
              onClick={activate}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  activate();
                }
              }}
            >
              {token}
            </button>
          );
        }

        // Pure punctuation — render as plain text
        return <Fragment key={i}>{token}</Fragment>;
      })}
    </>
  );
}
