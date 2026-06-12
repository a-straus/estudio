import type { CorrectionPayload, StruggleSentencePayload } from "@estudio/shared";
import "./InsightRow.css";

interface CorrectionRowProps {
  kind: "correction";
  payload: CorrectionPayload;
}

interface StruggleRowProps {
  kind: "struggle";
  payload: StruggleSentencePayload;
}

type InsightRowProps = CorrectionRowProps | StruggleRowProps;

/**
 * InsightRow — one mined lesson insight (D4). Static; no hover or selection.
 * kind=correction: two stacked lines (you / tutor).
 * kind=struggle: single sentence with optional analysis note.
 */
export function InsightRow(props: InsightRowProps) {
  if (props.kind === "correction") {
    const { said, corrected, note } = props.payload;
    return (
      <div className="insight-row insight-row--correction">
        <div className="insight-row__line">
          <span className="insight-row__lead">you</span>
          <span className="insight-row__text insight-row__text--said">{said}</span>
        </div>
        <div className="insight-row__line">
          <span className="insight-row__lead">tutor</span>
          <span className="insight-row__text insight-row__text--corrected">{corrected}</span>
        </div>
        {note && <p className="insight-row__note">{note}</p>}
      </div>
    );
  }

  const { sentence, note } = props.payload;
  return (
    <div className="insight-row insight-row--struggle">
      <div className="insight-row__line">
        <span className="insight-row__lead">struggled</span>
        <span className="insight-row__text">{sentence}</span>
      </div>
      {note && <p className="insight-row__note">{note}</p>}
    </div>
  );
}
