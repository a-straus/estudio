/** ISO-8601 → compact "Jun 11" in the machine voice; echoes input if unparseable. */
export function monthDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
