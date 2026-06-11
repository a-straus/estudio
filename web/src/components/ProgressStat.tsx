import "./ProgressStat.css";

interface ProgressStatProps {
  /** The count; null while loading (renders an em dash). */
  count: number | null;
  /** The honest unit, in plain words: "due today", "words", "mature". */
  unit: string;
  /** Optional mono sub-line. */
  sub?: string;
}

/** ProgressStat — a count with its unit, as a sentence fragment. No box, no icon. */
export function ProgressStat({ count, unit, sub }: ProgressStatProps) {
  return (
    <div
      className={"progress-stat" + (count === 0 ? " progress-stat--zero" : "")}
    >
      <p className="progress-stat__line">
        <span className="progress-stat__count">{count ?? "—"}</span>{" "}
        <span className="progress-stat__unit">{unit}</span>
      </p>
      {sub && <p className="progress-stat__sub">{sub}</p>}
    </div>
  );
}
