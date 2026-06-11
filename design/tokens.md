# ★ D2 · Design tokens

<!--
THE single source of truth: every visual value in the other design files —
and in the built product — references a token defined here by name.
Hardcoding a raw value where a token exists is a defect; a genuine new need
becomes a new token, added by the orchestrator as it lands. Define every
group in one CSS block; comment each token with what it is FOR, not what it
looks like. State the theming rule (e.g. "dark overrides color tokens
only") and the webfont policy explicitly.
-->

```css
:root {
  /* ---- Type families ----
     Raw stacks plus SEMANTIC ALIASES that name roles, not typefaces
     (e.g. --font-app, --font-meta). Implementation uses the aliases only;
     give each alias one comment naming the kind of text it owns. */

  /* ---- Type scale ----
     Every size in the product, smallest to largest, each commented with
     its use — a size with no named use does not exist. Include line
     heights, weights, and letterspacing if used. */

  /* ---- Color ----
     Page background(s) and surfaces, text hierarchy, rules/borders, ONE
     accent (plus on-accent and wash variants), semantic verdict/status
     colors with washes, focus. Theme variants override these under an
     attribute selector (e.g. [data-theme="dark"]). */

  /* ---- Spacing ----
     One scale (e.g. --space-1..8). Every margin, padding, and gap comes
     from it. */

  /* ---- Radii & shadows ----
     Few levels; state what each is reserved for. */

  /* ---- Layout & ergonomics ----
     Content measures (reading and app widths), minimum hit-target size,
     and any signature structural value (indents, bar heights). */

  /* ---- Motion ----
     Durations and easing, each with its use. State the motion budget —
     what is ALLOWED to move — and the prefers-reduced-motion rule. */
}
```

**Breakpoints** — custom properties cannot be used inside `@media`; define the canonical constants here, write them literally in code, comment them `/* bp-* */`:

| Name | Value | What changes there |
|---|---|---|
| `bp-…` | | |

**Token usage rules**

<!-- The cross-cutting bindings workers get wrong when left to guess: which
family/size/color each recurring text role gets, the universal focus style,
the reduced-motion rule. One line each. -->

-
