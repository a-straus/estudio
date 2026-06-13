/**
 * Pure adaptive-placement logic. No I/O, no LLM — deterministic from answers.
 * Bands ascend B2 → C1 → C2 → rare-archaic; start at C1.
 * After each ~6-word band: climb if ≥2/3 known, descend if ≤1/3 known, else stop.
 * Hard cap: 4 bands / ~24 words total.
 * Level estimate = highest band where owner knew the majority.
 */

export type Band = "B2" | "C1" | "C2" | "rare-archaic";

export const BANDS: Band[] = ["B2", "C1", "C2", "rare-archaic"];

export const BAND_SIZE = 6;
export const MAX_BANDS = 4;

export interface BandResult {
  band: Band;
  known: number;
  total: number;
}

export type AdaptiveDecision =
  | { done: true; level: Band; nextBand?: undefined }
  | { done: false; nextBand: Band; level?: undefined };

/**
 * Given the results for each completed band (in order), decide the next step.
 * Returns {done:true, level} once the run should stop, or {done:false, nextBand}
 * when another band should be served.
 */
export function nextStep(results: BandResult[]): AdaptiveDecision {
  if (results.length === 0) {
    return { done: false, nextBand: "C1" };
  }

  if (results.length >= MAX_BANDS) {
    return { done: true, level: estimateLevel(results) };
  }

  const last = results[results.length - 1];
  const ratio = last.total > 0 ? last.known / last.total : 0;
  const currentIdx = BANDS.indexOf(last.band);

  if (ratio >= 2 / 3) {
    // Climb one band
    if (currentIdx >= BANDS.length - 1) {
      // Already at the top band
      return { done: true, level: estimateLevel(results) };
    }
    // Only climb if we haven't already been to this higher band
    const upperBand = BANDS[currentIdx + 1];
    const alreadyDone = results.some((r) => r.band === upperBand);
    if (alreadyDone) {
      return { done: true, level: estimateLevel(results) };
    }
    return { done: false, nextBand: upperBand };
  }

  if (ratio <= 1 / 3) {
    // Descend one band
    if (currentIdx <= 0) {
      // Already at the bottom band
      return { done: true, level: estimateLevel(results) };
    }
    // Only descend if we haven't already been to this lower band
    const lowerBand = BANDS[currentIdx - 1];
    const alreadyDone = results.some((r) => r.band === lowerBand);
    if (alreadyDone) {
      return { done: true, level: estimateLevel(results) };
    }
    return { done: false, nextBand: lowerBand };
  }

  // Boundary is clear (1/3 < ratio < 2/3) — stop
  return { done: true, level: estimateLevel(results) };
}

/**
 * The level estimate is the highest band where the owner knew the majority (>50%).
 * Falls back to B2 if none cleared the majority threshold.
 */
export function estimateLevel(results: BandResult[]): Band {
  let best: Band = "B2";
  for (const r of results) {
    const ratio = r.total > 0 ? r.known / r.total : 0;
    if (ratio > 0.5) {
      const idx = BANDS.indexOf(r.band);
      const bestIdx = BANDS.indexOf(best);
      if (idx > bestIdx) best = r.band;
    }
  }
  // If even B2 wasn't passed but we started at B2, still show B2 as floor
  // Check if the first band served was B2 or higher; if B2 failed still return B2
  return best;
}
