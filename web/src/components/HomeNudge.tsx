import type { WhatNext } from "@estudio/shared";
import { Button } from "./Button";
import "./HomeNudge.css";

interface HomeNudgeProps {
  whatNext: WhatNext;
  onDismiss: () => void;
}

function sentence(wn: WhatNext): string {
  if (wn.kind === "grammar") {
    return `Your tutor is covering ${wn.topicName} — practice it.`;
  }
  return wn.count === 1 ? "1 word picked for you" : `${wn.count} words picked for you`;
}

function ctaLabel(wn: WhatNext): string {
  return wn.kind === "grammar" ? "Practice" : "See suggestions";
}

export function HomeNudge({ whatNext, onDismiss }: HomeNudgeProps) {
  return (
    <div className="home-nudge">
      <span className="home-nudge__lead">WHAT NEXT</span>
      <p className="home-nudge__sentence">{sentence(whatNext)}</p>
      <div className="home-nudge__actions">
        <Button variant="quiet" onClick={() => window.location.assign(whatNext.href)}>
          {ctaLabel(whatNext)}
        </Button>
        <Button variant="quiet" onClick={onDismiss} aria-label="Dismiss">
          ×
        </Button>
      </div>
    </div>
  );
}
