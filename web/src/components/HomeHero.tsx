import type { ReactNode } from "react";
import "./HomeHero.css";

interface HomeHeroProps {
  /** The day's featured word — display-scale serif headword. */
  headword: string;
  /** Optional sub-line under the headword (gloss / provenance sentence). */
  subhead?: ReactNode;
  /** Primary action under the entry (e.g. a "Start review" Button). */
  primaryAction?: ReactNode;
}

/**
 * HomeHero — the home centerpiece, the app's largest entry (D4, home.md).
 * The single lifted object on the page: --shadow-3, --motion-slow entrance.
 * The only use of --shadow-3 and --motion-slow in the app.
 */
export function HomeHero({ headword, subhead, primaryAction }: HomeHeroProps) {
  return (
    <section className="home-hero">
      <h1 className="home-hero__headword">{headword}</h1>
      {subhead && <div className="home-hero__subhead">{subhead}</div>}
      {primaryAction && <div className="home-hero__action">{primaryAction}</div>}
    </section>
  );
}
