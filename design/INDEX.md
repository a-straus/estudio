# Design contract — index

<!--
INSTRUCTIONS FOR HUMANS:
This directory is the design contract for everything user-facing — the UI
peer of ARCHITECTURE.md. Anything you leave unspecified, the agents fill
with the most generic plausible answer; the more you specify, the more the
product looks like yours instead of theirs.

It is a directory rather than one file so each task loads only the sections
it needs: worker briefs name the specific files that apply, and workers
read those and nothing else here. Keep every file self-contained.

Three ways to use it:
- You have a design → fill these files (or paste a spec that covers the
  same sections) before starting the orchestrator. It is then the law for
  all UI.
- The product has a UI but you have no design → leave the templates
  unfilled; the orchestrator drafts every file in the design phase
  (iteration 1, challenged by the same critic that attacks ARCHITECTURE.md)
  and you review it at the first-hour checkpoint.
- No UI → ignore this directory; it stays inert.

Files marked ★ in the map below must be filled — by you or by the design
phase — before any UI task is spawned. D0/D1/D5/D6 multiply consistency but
may start thin.

How agents use it:
- Workers build UI from the files their brief names and never edit any of
  them — `integrate` mechanically refuses any branch that touches design/.
- Where the contract is silent, workers don't stop and don't ask: they
  extrapolate from the identity and principles here and the rules in
  tokens.md. The orchestrator folds genuinely new shared components and
  tokens back into the contract as they land (components.md / tokens.md +
  a Change log line below), so it always matches the built product. You
  are never asked to approve a component.
- The first UI task — the design foundation — materializes tokens.md
  verbatim as the project's token stylesheet and builds the components.md
  base components; every later UI brief names the design files it
  implements and composes that library.

Steer it like everything else: small design changes via FEEDBACK.md
## Inbox; identity-level changes by editing these files between runs.
-->

## Files

| File | Contents | A task reads it when |
|---|---|---|
| `INDEX.md` | identity (D0), principles (D1), this map, the Change log | every UI task (always) |
| ★ `tokens.md` | D2 — all design tokens, breakpoints, token-usage rules | every UI task (always) |
| ★ `screens/shell.md` | the global shell: navigation chrome, takeover patterns, page defaults | tasks that build or change a screen |
| ★ `screens/<screen>.md` | one file per screen: purpose, regions, layout, responsive, states | only the screen(s) the brief names |
| ★ `components.md` | D4 — shared component library: anatomy, variants, states | tasks that build or compose components |
| `interaction.md` | D5 — feedback choreography, keyboard map, touch ergonomics, microcopy | interaction work and any user-facing strings |
| `mockups.md` | D6 — reference mockup list | a listed mockup covers the task's screen |

Once the design foundation has landed in code, the token stylesheet and the
component sources are the ground truth for HOW things are built; these
files remain the ground truth for WHAT to build (screens, states, strings).

---

## D0 · Design identity

<!--
Two paragraphs at most: the single expressive idea the product is
recognized by, and the discipline around it.
- Name ONE signature element (an object, a typographic form, a layout move)
  and list where it appears.
- State what stays deliberately plain so the signature reads: chrome, how
  many colors, how much motion.
If there is no signature, write "none — strictly utilitarian" so agents
stop looking for one.
-->

-

---

## D1 · Design principles

<!--
5–8 numbered rules a worker can apply to a screen you never specified.
Operational, not aspirational: "every count appears with its unit in plain
words", not "clean and modern". Good principles decide real cases: what
earns the accent color, what is allowed to animate, which voice a string
belongs to, who owns the bottom of a mobile viewport.
-->

1.
2.
3.

---

**Consistency rule.** `tokens.md` is the single source of truth: every
visual value in the other design files and in implementation references a
token by name — never a raw value where a token exists. Genuinely new needs
become new tokens, added to tokens.md (+ Change log here) as they land, so
this contract and the product never drift more than one iteration apart.

## Change log

<!-- Kept by the orchestrator once the build is underway: one line per
amendment after the initial draft — date · file · what changed · why. This
is how the contract stays in sync with the built product. -->
