import { Fragment } from "react";
import type { CorrectionPayload, StruggleSentencePayload } from "@estudio/shared";
import { Button } from "./Button";
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

interface WordSpan {
  word: string;
  changed: boolean;
}

function wordDiff(
  a: string,
  b: string,
): { aSpans: WordSpan[]; bSpans: WordSpan[] } {
  const aw = a.split(" ");
  const bw = b.split(" ");

  let pfx = 0;
  while (pfx < aw.length && pfx < bw.length && aw[pfx] === bw[pfx]) pfx++;

  let sfx = 0;
  while (
    sfx < aw.length - pfx &&
    sfx < bw.length - pfx &&
    aw[aw.length - 1 - sfx] === bw[bw.length - 1 - sfx]
  )
    sfx++;

  const aEnd = aw.length - sfx;
  const bEnd = bw.length - sfx;

  return {
    aSpans: aw.map((word, i) => ({ word, changed: i >= pfx && i < aEnd })),
    bSpans: bw.map((word, i) => ({ word, changed: i >= pfx && i < bEnd })),
  };
}

function SpannedText({ spans }: { spans: WordSpan[] }) {
  return (
    <>
      {spans.map((s, i) => (
        <Fragment key={i}>
          {i > 0 && " "}
          {s.changed ? (
            <span className="insight-row__changed">{s.word}</span>
          ) : (
            s.word
          )}
        </Fragment>
      ))}
    </>
  );
}

/**
 * InsightRow — one mined lesson insight (D4). Static; no hover or selection.
 * kind=correction: two stacked lines (you / tutor) with word-level diff underline.
 * kind=struggle: single sentence with optional analysis note.
 */
export function InsightRow(props: InsightRowProps) {
  if (props.kind === "correction") {
    const { said, corrected, note } = props.payload;
    const { aSpans, bSpans } = wordDiff(said, corrected);
    const askHref = `/ask?new=1&kind=other&label=${encodeURIComponent(corrected)}`;
    return (
      <div className="insight-row insight-row--correction">
        <div className="insight-row__line">
          <span className="insight-row__lead">you</span>
          <span className="insight-row__text insight-row__text--said">
            <SpannedText spans={aSpans} />
          </span>
        </div>
        <div className="insight-row__line">
          <span className="insight-row__lead">tutor</span>
          <span className="insight-row__text insight-row__text--corrected">
            <SpannedText spans={bSpans} />
          </span>
        </div>
        {note && <p className="insight-row__note">{note}</p>}
        <div className="insight-row__footer">
          <Button
            variant="quiet"
            onClick={() => {
              window.location.href = askHref;
            }}
          >
            Ask about this
          </Button>
        </div>
      </div>
    );
  }

  const { sentence, note } = props.payload;
  const askHref = `/ask?new=1&kind=other&label=${encodeURIComponent(sentence)}`;
  return (
    <div className="insight-row insight-row--struggle">
      <div className="insight-row__line">
        <span className="insight-row__lead">struggled</span>
        <span className="insight-row__text">{sentence}</span>
      </div>
      {note && <p className="insight-row__note">{note}</p>}
      <div className="insight-row__footer">
        <Button
          variant="quiet"
          onClick={() => {
            window.location.href = askHref;
          }}
        >
          Ask about this
        </Button>
      </div>
    </div>
  );
}
