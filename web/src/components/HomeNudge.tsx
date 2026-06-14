import type { ReactNode } from "react";
import type { WhatNext } from "@estudio/shared";
import { Button } from "./Button";
import "./HomeNudge.css";

interface HomeNudgeProps {
  whatNext: WhatNext;
  onDismiss: () => void;
}

function sentence(wn: WhatNext): ReactNode {
  if (wn.kind === "grammar") {
    return `Your tutor is covering ${wn.topicName} — practice it.`;
  }
  const n = wn.count;
  return (
    <>
      <span className="home-nudge__count">{n}</span>
      {n === 1 ? " word picked for you" : " words picked for you"}
    </>
  );
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
