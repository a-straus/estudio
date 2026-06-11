import { useRef } from "react";
import type { KeyboardEvent } from "react";
import "./SegmentedControl.css";

export interface SegmentedOption {
  value: string;
  label: string;
}

interface SegmentedControlProps {
  /** Accessible name for the group, e.g. "Deck" or "Length". */
  label: string;
  options: SegmentedOption[];
  value: string;
  onChange: (value: string) => void;
}

/**
 * SegmentedControl — single-choice row (Deck, Length, Style, Direction,
 * Ingest method, Library filters). Radiogroup semantics with roving
 * tabindex; arrow keys move the selection.
 */
export function SegmentedControl({
  label,
  options,
  value,
  onChange,
}: SegmentedControlProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    let delta = 0;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") delta = 1;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") delta = -1;
    else return;
    e.preventDefault();
    const next = (selectedIndex + delta + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option, i) => (
        <button
          key={option.value}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={i === selectedIndex}
          tabIndex={i === selectedIndex ? 0 : -1}
          className={
            "segmented__segment" +
            (i === selectedIndex ? " segmented__segment--selected" : "")
          }
          onClick={() => onChange(option.value)}
          onKeyDown={handleKeyDown}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
