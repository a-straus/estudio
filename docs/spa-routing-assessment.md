# Technical scoping assessment: convert the multi-page app to a Single Page Application (SPA)

**Status:** assessment only — no source code changed. Awaiting owner decision.
**Goal (owner feedback):** "Convert the current multi-page application into a Single Page Application (SPA) to eliminate full-page refreshes when navigating via the bottom nav bar."

---

## 1. Current architecture — how routing and navigation work today

### 1.1 The app is technically an SPA *bundle*, but navigates like a multi-page app

The frontend is a single React bundle mounted once:

- `web/src/main.tsx:7` — `createRoot(document.getElementById("root")!).render(<App />)`. There is exactly one React root; the app is built and shipped as one SPA bundle.
- The Express server already serves that one bundle for **every** non-API path via a catch-all: `server/src/app.ts:103` — `app.get(/.*/, ...)` → `res.sendFile(index.html)`. So deep links like `/review`, `/grammar`, `/triage?source=3` all return the same `index.html`. (This matters for §3 — the server-side SPA fallback the options below depend on already exists.)

So far this is SPA-shaped. The reason the app *behaves* like a multi-page app is entirely in `App.tsx` and the navigation call sites.

### 1.2 Routing is a pure render-time read of `window.location` — there is no router

`web/src/App.tsx:21-23` states the design intent verbatim:

```
// Minimal routing: the app routes on window.location.pathname (no react-router).
// Session screens (Review, Triage, Quiz play) take the full screen with no
// chrome; every other screen is wrapped in the shared AppShell.
```

`App()` (`App.tsx:52-163`) is a plain function component that, on each render, reads `window.location.pathname` / `window.location.search` directly and returns the matched screen:

- `readSourceId()` (`App.tsx:24-30`) reads `pathname`/`search` for `/triage?source=…`.
- `readReviewDeckId()` (`App.tsx:34-40`) reads `/review?deck=…`.
- `readLessonTopicId()` (`App.tsx:43-50`) regex-matches `/grammar/topics/:id/lesson`.
- The body is a waterfall of `if (window.location.pathname.startsWith("/library"))` … `/ingest` … `/grammar` … `/quiz` … `/system` … `/ask` … `/suggestions` … `/lessons` … `/notes`, falling through to Home (`App.tsx:70-162`).

**Critical fact:** `App()` never subscribes to URL changes. There is **no `popstate` listener, no `history.pushState`, no router context, no state derived from the URL.** `App` only re-reads `window.location` when React re-renders it for some *other* reason — which never happens on navigation, because navigation throws the whole page away first. The URL is read exactly once per document load.

### 1.3 The "session takeover vs AppShell chrome" distinction lives in App.tsx

This is the structural invariant any SPA conversion must preserve:

- **Session takeover (no chrome):** `/triage` returns `<Triage …/>` bare (`App.tsx:54-57`). Quiz's *play* phase takes over internally (`App.tsx:103-105`).
- **AppShell-wrapped (chrome):** every other route returns `<AppShell title=… activeHref=…>{() => <Screen/>}</AppShell>` (e.g. `App.tsx:62-68`, `70-76`, `95-101`). `AppShell` (`web/src/components/AppShell.tsx:67-115`) renders `SiteHeader` + `<main>` + `SiteFooter` + `AppNav`, owns the global theme, and fires the **shared overview fetch** (`AppShell.tsx:71-87`).

### 1.4 Every in-app navigation is a full document load — confirmed, and why

There are two navigation mechanisms in the tree, and **both trigger a full browser document navigation** (unload current document → re-request `index.html` → re-download/parse/execute the JS bundle → fresh React mount → every screen's `useEffect` data fetch re-runs from zero):

**(a) Plain `<a href>` anchors** — a click is a native browser navigation; nothing calls `preventDefault()`, so the browser unloads the page:

| Component | Evidence | Links |
|---|---|---|
| **AppNav (phone bottom bar)** | `web/src/components/AppNav.tsx:29-39` — `<a href={item.href} …>` | `/`, `/review`, `/library`, `/grammar` (`AppNav.tsx:12-17`) |
| SiteHeader (tablet+ nav) | `web/src/components/SiteHeader.tsx:33-42` — `<a href={item.href} …>` | the `NAV` list from `AppShell.tsx:34-43` |
| SiteFooter (utility links) | `web/src/components/SiteFooter.tsx:39` — `<a href={link.href} …>` | `/ingest`, `/notes`, `/system` (`AppShell.tsx:46-50`) |
| Home | `web/src/screens/Home.tsx:200` `<a href="/library">`; `Home.tsx:243` `<a href={c.href}>` (overview cards) | library, feature cards |
| Grammar | `web/src/screens/Grammar.tsx:72,83` `<a … href={lessonHref(topic)}>` | per-topic lesson |
| Ingest | `web/src/screens/Ingest.tsx:355` `<a href="/lessons">`; `Ingest.tsx:361` `<a href={`/triage?source=${job.sourceId}`}>` | lessons, triage |
| OverviewCard | `web/src/components/OverviewCard.tsx:30` `<a href={href}>` | overview destinations |

**(b) Programmatic `window.location.assign(...)` / `window.location.href = ...`** — these are explicit full-page navigations by definition:

| Call site | Evidence | Target |
|---|---|---|
| Home | `web/src/screens/Home.tsx:21` — `go()` → `window.location.assign(href)` | any |
| Lesson | `web/src/screens/Lesson.tsx:397` — `window.location.assign("/grammar")` | back to Grammar |
| Quiz | `web/src/screens/Quiz.tsx:488` `assign("/ingest")`; `Quiz.tsx:563` `assign("/")` | ingest, home |
| Review | `web/src/screens/Review.tsx:597` `assign("/ingest")`; `Review.tsx:643` `assign("/")` | ingest, home |
| Triage | `web/src/screens/Triage.tsx:165` `assign("/review")`; `Triage.tsx:166` `assign("/library")` | review, library |
| Lessons | `web/src/screens/Lessons.tsx:206` `window.location.href = href`; `Lessons.tsx:428` `= "/ingest"` | lesson, ingest |
| Suggestions | `web/src/screens/Suggestions.tsx:122` `window.location.href = "/"` | home |
| AppShell (Ask button) | `web/src/components/AppShell.tsx:102` — `window.location.href = `/ask?new=1&…`` | ask |
| InsightRow | `web/src/components/InsightRow.tsx:96,119` — `window.location.href = askHref` | ask |

**Why the refresh happens on bottom-nav navigation specifically:** tapping a bottom-nav item is case (a) — a bare `<a href="/review">` in `AppNav.tsx:29-39`. The browser performs a standard navigation: it discards the running React app, re-fetches `index.html` from Express (`app.ts:103`), re-parses and re-executes the whole JS/CSS bundle, React mounts fresh, `App()` reads the new `window.location.pathname` once (`App.tsx:52+`), and the matched screen mounts and re-runs its `useEffect` fetch. That full teardown/rebuild *is* the visible full-page refresh. The app has all the *ingredients* of an SPA (one bundle, one root, server fallback) but performs zero client-side route transitions.

### 1.5 Data is fetched per-screen on mount — relevant to what a route transition must re-do

Every screen fetches its own data in a mount `useEffect` (confirmed present in `Ask, Suggestions, Library, Lesson, Notes, System, Lessons, Quiz, Grammar, Triage, Review, Ingest`). The shared overview read is owned once by `AppShell` (`AppShell.tsx:71-87`) and passed into the wrapped screen and footer. Today each full reload re-runs *all* of these from scratch; that is wasted work the SPA conversion is meant to remove — but it also means **a client-side transition into a screen will still trigger that screen's own mount fetch**, which is the correct and desired behavior (each screen stays the owner of its data; see §2).

---

## 2. What "convert to SPA" concretely means HERE

The conversion is narrow and well-bounded because the bundle, the single root, and the server fallback already exist. Concretely it means:

1. **Client-side route transitions.** On an in-app navigation, call `history.pushState(null, "", href)` instead of letting the browser navigate, then trigger a React re-render so `App()` re-reads `window.location` and swaps the matched screen — **no document reload.**
2. **Intercept in-app link clicks.** A bare `<a href>` click must be intercepted (`preventDefault()` + `pushState` + re-render) for *internal, same-origin, plain* clicks only. Standard escape hatches must be respected so the browser still does the native thing for: modified clicks (⌘/Ctrl/Shift/Alt), middle-click, `target="_blank"`, `download`, non-GET, or external/cross-origin hrefs.
3. **Handle Back/Forward.** Add a `popstate` listener that re-renders so the browser's back/forward buttons move between client routes instead of reloading.
4. **Scroll & focus restoration.** A full reload currently resets scroll to top and focus to `<body>` for free. A client transition does **not** — without explicit handling, the new screen inherits the old scroll position and focus. The conversion must reset scroll to top on a forward navigation (and ideally restore the prior position on back/forward), and move focus to the new screen's heading/main for accessibility.
5. **Preserve the session-vs-chrome distinction.** The transition mechanism must keep `App.tsx`'s existing branch structure intact: navigating to `/triage` still renders bare `<Triage/>` (no chrome), navigating to `/review` still renders inside `<AppShell>`. Because the matcher is unchanged, this falls out for free as long as we only change *how* `App` is re-invoked, not *what* it returns.
6. **Data refetch semantics stay per-screen.** Each screen keeps fetching on mount. The win is that *unrelated* work stops re-running: the JS bundle is no longer re-parsed, and `AppShell`'s shared overview fetch only re-runs when `AppShell` itself remounts (which we can preserve or optimize — see options).

**Out of scope by constraint:** still **one web deployable** (no separate router server, no SSR); plain CSS, boring/stable formats; hard non-goal "no native mobile app" — this stays a web app. No paid dependency; no change to hosting/exposure.

---

## 3. Options with trade-offs, effort, and risk

Both options rely on a fact already true in this repo: **the server returns `index.html` for any path** (`server/src/app.ts:103`), so deep links and refreshes keep working after conversion. **No server change is required for either option.**

### Option A — Minimal hand-rolled history-based router (recommended)

Keep `App.tsx`'s pathname-matching waterfall exactly as-is. Add a tiny module that (i) holds a "navigation tick" so `App` re-renders on demand, (ii) exposes a `navigate(href)` that does `history.pushState` + bump the tick, (iii) listens for `popstate` to bump the tick, and (iv) installs one document-level click interceptor that turns plain internal `<a>` clicks into `navigate()`.

This is the smallest change and stays faithful to the repo's stated, deliberate "no react-router, minimal routing" choice (`App.tsx:21`).

**Sketch (new file, illustrative — not committed here):**
```ts
// web/src/router.tsx  (NEW)
import { useEffect, useState } from "react";

export function navigate(href: string) {
  if (href === window.location.pathname + window.location.search) return;
  window.history.pushState(null, "", href);
  window.dispatchEvent(new Event("estudio:navigate"));
  window.scrollTo(0, 0);
}

// App subscribes to this so it re-reads window.location on every transition.
export function useLocationTick() {
  const [, bump] = useState(0);
  useEffect(() => {
    const onChange = () => bump((n) => n + 1);
    window.addEventListener("popstate", onChange);
    window.addEventListener("estudio:navigate", onChange);
    return () => {
      window.removeEventListener("popstate", onChange);
      window.removeEventListener("estudio:navigate", onChange);
    };
  }, []);
}

// One delegated interceptor for plain internal <a> clicks.
export function useLinkInterception() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest("a");
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href || !href.startsWith("/")) return;          // internal only
      if (a.target === "_blank" || a.hasAttribute("download")) return;
      if (a.origin !== window.location.origin) return;
      e.preventDefault();
      navigate(href);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
}
```

**Which files change:**
- **New:** `web/src/router.tsx` (the ~40 lines above) + `web/src/router.test.tsx`.
- **`web/src/App.tsx`:** call `useLocationTick()` and `useLinkInterception()` at the top of `App()`. **The entire matching waterfall stays byte-for-byte the same** — it already reads `window.location` on each render; we are only causing it to render on navigation. This is the key reason A is low-risk: the session-vs-chrome logic (`App.tsx:54-162`) is untouched.

**How nav links / `window.location.assign` call sites change:**
- **`<a href>` anchors (case 3.1a):** *zero code change.* The document-level interceptor catches them. AppNav, SiteHeader, SiteFooter, Home, Grammar, Ingest, OverviewCard all keep their existing `<a href>` markup — which also keeps middle-click/open-in-new-tab/SEO/right-click working for free. This is a major ergonomic win of the delegated-interceptor approach.
- **`window.location.assign(...)` / `window.location.href = ...` (case 3.1b, ~12 call sites in Home, Lesson, Quiz, Review, Triage, Lessons, Suggestions, AppShell, InsightRow):** mechanical swap to `navigate(...)` from the new module. Each is a one-line change (`window.location.assign("/review")` → `navigate("/review")`). These are the only edits to existing component files.

**Data-refetch implications:** Each screen still fetches on its own mount — desired. One nuance: with Option A, navigating between two AppShell routes (e.g. Library → Grammar) keeps the **same** `AppShell` instance mounted, so its overview fetch (`AppShell.tsx:71-87`) does **not** re-run — a free improvement (today it re-runs on every reload). React swaps only the inner `children()` screen, which remounts and runs its own fetch. Navigating into/out of a session screen (`/triage`) unmounts/remounts `AppShell` as today. No data-flow refactor needed; behavior is strictly better.

**Test impact:**
- Existing tests that assert on `window.location.href` after a programmatic nav (`web/src/components/InsightRow.test.tsx:132,145`) must be updated, since those call sites move from `window.location.href = …` to `navigate(…)`. Re-point them at the `navigate`/`pushState` spy.
- Add `router.test.tsx`: interceptor honors modifier/middle/`_blank`/`download`/external escape hatches; `popstate` re-renders; `navigate` pushes state and resets scroll. This is pure DOM-level logic, easily unit-testable under the existing Vitest/jsdom setup.
- `OverviewCard.test.tsx` / anchor-rendering tests are unaffected (markup unchanged).

**Main risks (all containable):**
- **Click-interception correctness.** The escape-hatch list must be complete or you break ⌘-click/new-tab/downloads. Mitigated by the explicit guard list above + tests.
- **Scroll/focus restoration** is now your job (no free reset). Forward = scroll-to-top + focus heading; back/forward = restore. Small but easy to under-do; call it out as its own task.
- **Hash/anchor links & query-only changes** (e.g. `?deck=2`) must re-render correctly — covered because `App` re-reads `search` too.
- **Forms / external links** must fall through to native — covered by the `href.startsWith("/")` + origin guards.

**Rough effort:** **~1–1.5 days.** New module + tests (~0.5d), App wiring (~0.5h), swap ~12 `location.assign` call sites + fix 2 tests (~0.5d incl. manual pass), scroll/focus polish (~0.25d).
**Risk:** **Low.** No new dependency, no server change, matcher untouched, anchors unchanged, reversible (delete the module, restore the call sites).

### Option B — Adopt `react-router`

Add `react-router-dom` (free, MIT-licensed — allowed by the brief) and replace `App.tsx`'s waterfall with a `<BrowserRouter>` + `<Routes>`/`<Route>` tree; replace anchors with `<Link>`/`<NavLink>` and programmatic navs with `useNavigate()`.

**Which files change:**
- `web/src/main.tsx` — wrap `<App/>` in `<BrowserRouter>`.
- `web/src/App.tsx` — rewrite the entire `App.tsx:52-163` waterfall as a `<Routes>` tree, including the param routes (`/triage`, `/review?deck`, `/grammar/topics/:id/lesson`) via `useParams`/`useSearchParams`. The session-vs-chrome split becomes a layout-route pattern (`<Route element={<AppShellLayout/>}>` for chrome routes, bare routes for `/triage`) — a real restructure of the file, not a wiring tweak.
- **Every navigation site changes:** AppNav, SiteHeader, SiteFooter, OverviewCard, Home, Grammar, Ingest anchors → `<Link to=…>`; all ~12 `window.location.assign`/`.href` call sites → `useNavigate()`. SiteHeader/SiteFooter/AppNav currently take `href` strings and are deliberately "router-free" (`SiteHeader.tsx:4` "Routing is the caller's job"; `SiteHeader.tsx:24` "nothing here imports a router") — adopting react-router pushes router imports down into these shared components or forces a prop redesign.

**Data-refetch implications:** Same per-screen mount fetches. react-router offers `loader`s, but using them would be a *further* refactor (moving each screen's `useEffect` fetch into a route loader) — not required, and a larger change than the goal warrants.

**Test impact:** Larger. Any test that renders a screen or a nav component now needs a `<MemoryRouter>` wrapper. `InsightRow.test.tsx`, `OverviewCard.test.tsx`, and any future screen test must provide router context. New dependency enters the lockfile and bundle.

**Main risks:**
- **Largest blast radius** — touches `App.tsx`, `main.tsx`, every nav component, and test harnesses at once. More to get wrong in one pass.
- **Directly contradicts a deliberate, documented choice** (`App.tsx:21` "no react-router"; the router-free comments in `SiteHeader.tsx`). Reversing it should be a conscious owner decision, not an implementation detail.
- **New dependency** to track/update (acceptable per brief, but real maintenance surface for a single-user boring-stack app).
- Bundle size + an API surface far larger than this app's ~12 routes need.

**Rough effort:** **~3–5 days** (App rewrite, prop redesign for the three shared nav components, every call site, test-harness updates, regression pass).
**Risk:** **Medium.** Bigger refactor, contradicts stated architecture, more test churn — but it's a well-trodden library, so low *uncertainty*, just high *churn*.

### At-a-glance

| | Option A (hand-rolled) | Option B (react-router) |
|---|---|---|
| New dependency | none | `react-router-dom` |
| `App.tsx` matcher | unchanged | rewritten as `<Routes>` |
| `<a href>` nav sites | unchanged (delegated interceptor) | each → `<Link>` |
| `location.assign` sites (~12) | one-line → `navigate()` | one-line → `useNavigate()` |
| Shared nav components (Header/Footer/AppNav) | unchanged (stay router-free) | take router imports / prop redesign |
| Test churn | 2 tests + new router tests | every render needs router context |
| Server change | none | none |
| Effort | ~1–1.5 days | ~3–5 days |
| Risk | Low | Medium |
| Fidelity to repo's stated choice | preserves it | reverses it |

---

## 4. Recommendation

**Adopt Option A — the minimal hand-rolled history-based router.**

Rationale grounded in this codebase:
- It is the **smallest change that fully meets the goal** (no full-page refresh on bottom-nav navigation), and it leaves `App.tsx`'s session-vs-chrome matcher (`App.tsx:54-162`) and the three router-free shared nav components (`AppNav`, `SiteHeader`, `SiteFooter`) **untouched**.
- It honors the repo's **explicit, deliberate** "no react-router, minimal routing" decision (`App.tsx:21`) and the boring/stable-stack constraint — no new dependency enters a single-user app.
- The **delegated click interceptor** means the dozens of existing `<a href>` links (including the bottom nav) need **zero edits** and keep native open-in-new-tab/middle-click behavior; only the ~12 programmatic `window.location.assign` call sites change, one line each.
- It is **trivially reversible** and requires **no server change** (the SPA fallback at `app.ts:103` already exists).

Choose Option B only if the owner anticipates a near-future need for nested routes, route-level data loaders, or other react-router features that would outgrow a hand-rolled matcher — the present 12-route, single-user app does not.

---

## 5. Task breakdown if greenlit (Option A, worker-sized steps)

1. **Add `web/src/router.tsx`** — `navigate(href)` (pushState + dispatch + scroll-to-top), `useLocationTick()` (re-render on `popstate` + custom nav event), `useLinkInterception()` (delegated click handler with the full escape-hatch guard list: modifier keys, middle-click, `target=_blank`, `download`, non-internal/cross-origin). *Tests in `router.test.tsx`.* — ~0.5 day.
2. **Wire `App.tsx`** — call `useLocationTick()` and `useLinkInterception()` at the top of `App()`. Change nothing else in the matcher. — ~0.5 hour.
3. **Swap programmatic nav call sites** to `navigate(...)`: `Home.tsx:21`, `Lesson.tsx:397`, `Quiz.tsx:488,563`, `Review.tsx:597,643`, `Triage.tsx:165,166`, `Lessons.tsx:206,428`, `Suggestions.tsx:122`, `AppShell.tsx:102`, `InsightRow.tsx:96,119`. One-line each. — ~0.5 day incl. fixing `InsightRow.test.tsx:132,145`.
4. **Scroll & focus restoration** — confirm scroll-to-top on forward nav; restore on back/forward (optionally via `history.scrollRestoration = "manual"` + a position cache keyed by history state); move focus to the new screen's `<main>`/heading for a11y. *Test the scroll reset.* — ~0.25 day.
5. **Manual verification pass on desktop Chrome + one real phone browser** (both primary per the quality bar): tap every bottom-nav item — no white flash / no full reload; Back/Forward work; deep-link refresh of `/review`, `/grammar/topics/:id/lesson`, `/triage?source=N` still loads the right screen (relies on `app.ts:103`); ⌘-click / middle-click still open new tabs; session screens (`/triage`, quiz play) still render chrome-less; AppShell overview no longer re-fetches when moving between two chrome routes. — ~0.25 day.
6. **Run `bash check.sh`**, update `DECISIONS.md` with the routing choice and the rationale for keeping it hand-rolled. — ~0.25 day.

**Total: ~1.5–2 days including verification and docs.** No schema change, no new dependency, no server change, one deployable preserved.
