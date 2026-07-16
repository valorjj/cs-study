# Section Outline Navigation — Design Spec

**Date:** 2026-07-16
**Status:** Approved (pending user review of this doc)

## Problem

Each domain note (e.g. `notes/03-network/network-core.md`) is a single file with
many top-level `#` (H1) sections (N1…N8 + a `핵심 질문 (Quiz)` section). Multiple
graph nodes point into the **same file** via different `#anchor`s:

```
net-osi   → network-core.md#n1-...
net-tcp   → network-core.md#n2-...
net-http  → network-core.md#n3-...     (L1)
  net-httpver → network-core.md#n8-... (L2, child of HTTP)
...
```

`NoteView` renders a **tab bar of every H1 section in the file**. So opening any
one node (e.g. "HTTP 버전 발전") shows 8+ tabs that are actually *other nodes'*
content — redundant with the tree/graph, and misleading ("this note has 8
sub-sections" when the node is really one section).

Every H1 section already maps to a graph node **except** the domain-wide
`핵심 질문 (Quiz)` section, which has no node and is only reachable via the tab bar.

## Goal

Make the note view show **one node = one section**, drop the cross-node tab bar,
and instead surface the **current section's own H2/H3 sub-headings** as an
outline (table of contents) for in-page jumping. Give the orphaned Quiz a home
on the domain (L0) node.

## Decisions (from brainstorming)

1. **Tab bar removed.** Note view renders only the node's anchored section.
   Sibling navigation happens through the tree (list mode) or the graph +
   "연결된 개념" chips (graph mode) — no tabs needed.
2. **Section outline (TOC).** The rendered section's H2/H3 headings become a
   clickable outline that scrolls to the heading. rehype-slug already assigns
   matching `id`s to rendered headings.
3. **Quiz → domain (L0) node.** Each L0 domain node gets a `noteRef` of
   `<domain-core-file>#핵심-질문-quiz`. Clicking a domain (tree row label or graph
   node) shows that domain's Quiz set. This also seeds the future daily-quiz
   feature. Domain rows keep expand/collapse via their caret; the label click
   now selects (shows Quiz).

## Data facts (verified)

- `github-slugger` slug of `핵심 질문 (Quiz)` = `핵심-질문-quiz` — identical across
  all 13 note files that contain a quiz section.
- Only 2 nodes have a `noteRef` with no `#anchor` (`collections`,
  `generics-stream`) — self-contained single-concept files → fall back to first
  section.
- noteRef path format is `notes/<dir>/<file>.md#<anchor>` (no leading slash;
  `parseNoteRef` prepends `/`).
- The Quiz section has 0 H2s (flat `<details>` Q&A folds) → no outline shown.

### Domain (L0) → core file map

| domain id      | noteRef to add                                             |
|----------------|-----------------------------------------------------------|
| `java`         | `notes/01-java-jvm/jvm-memory-gc.md#핵심-질문-quiz`         |
| `os`           | `notes/02-os/os-core.md#핵심-질문-quiz`                     |
| `network`      | `notes/03-network/network-core.md#핵심-질문-quiz`          |
| `database`     | `notes/04-database/database-core.md#핵심-질문-quiz`        |
| `spring`       | `notes/05-spring/spring-core.md#핵심-질문-quiz`            |
| `systemdesign` | `notes/06-system-design/system-design-core.md#핵심-질문-quiz` |
| `devops`       | `notes/07-devops/devops-core.md#핵심-질문-quiz`            |
| `hw`           | `notes/08-hardware/hardware-core.md#핵심-질문-quiz`        |
| `dsa`          | `notes/09-dsa/dsa-core.md#핵심-질문-quiz`                  |
| `react`        | `notes/10-react/react-core.md#핵심-질문-quiz`              |
| `javascript`   | `notes/11-javascript/javascript-core.md#핵심-질문-quiz`    |

## Architecture

### `src/lib/notes.ts` — add `extractOutline`

```ts
export interface OutlineItem { depth: 2 | 3; text: string; slug: string }

// Parse H2/H3 headings from a section body (code-fence aware) into an outline.
// Slugs are produced with a fresh github-slugger Slugger in document order, so
// they match the ids rehype-slug assigns when the same body is rendered.
export function extractOutline(body: string): OutlineItem[]
```

- Uses `new GithubSlugger()` and `.slug(text)` per heading in order (matches
  rehype-slug's per-render dedup counters).
- Skips headings inside ``` / ~~~ fences (same guard as `parseSections`).

### `src/components/NoteView.tsx` — single-section render + outline

- Remove `override`/`setOverride` state and the `.np-tabs` tab bar.
- `active` section = the section whose slug === the node's anchor, else first
  section (unchanged default logic, minus tab override).
- Compute `outline = extractOutline(active.body)`; render an outline `<nav>`
  only when `outline.length >= 2`.
- Clicking an outline item scrolls the matching heading (`#slug`) into view,
  scoped to the note container ref (`scrollIntoView({ behavior: 'smooth',
  block: 'start' })`).
- Keep the existing single-blob fallback (`sections.length === 0`) and the
  loading / no-note states.

### `src/components/NotePanel.css`

- Remove/replace `.np-tabs` tab styling with `.np-outline` list styling
  (domain-colored, indented H3, hover state).
- Add `scroll-margin-top` to rendered `.np-note h2, .np-note h3` so smooth
  scroll clears the sticky header.

### `src/graph/graph.json`

- Add the `noteRef` field to the 11 L0 domain nodes per the table above.

## Component boundaries

- `extractOutline` is a pure function (input: markdown string → output: list),
  independently unit-tested — no React, no DOM.
- `NoteView` owns rendering + scroll side-effect; it consumes `extractOutline`
  and existing `parseSections`/`parseNoteRef`.
- Data change (graph.json) is isolated and independently verifiable in the tree.

## Testing

- **Unit** (`notes.test.ts`): `extractOutline` — extracts H2 & H3 in order,
  ignores headings in code fences, produces github-slugger-matching slugs,
  returns `[]` for a body with no sub-headings (Quiz case).
- **Unit** (existing `notes.test.ts` for `parseSections`) stays green.
- **Runtime (verify skill, real browser):**
  - Open a leaf node (e.g. HTTP 버전 발전) → exactly one section, no tab bar,
    outline lists its H2s, clicking an outline item scrolls to that heading.
  - Click a domain node (e.g. Network) → Quiz section renders.
  - A single-concept node with no anchor (`generics-stream`) → renders, no crash.

## Out of scope

- Splitting mega-note files into per-concept files.
- Daily quiz view and study-sequence features (separate specs later).
- Nesting H2/H3 as real tree rows.
```
