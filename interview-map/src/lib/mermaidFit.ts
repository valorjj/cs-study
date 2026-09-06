/**
 * Mermaid's `useMaxWidth: true` scales the whole SVG — text included — down to
 * whatever the container is. A wide diagram therefore buys "it fits" by paying
 * with legibility: measured in this app, a 1522px-wide diagram in an 886px
 * column rendered its labels at 8.7px on desktop and 3.5px on a phone, against
 * an intended 15px.
 *
 * We stop making that trade. The diagram may never shrink below
 * MIN_LEGIBLE_SCALE; past that it keeps its size and the figure scrolls
 * horizontally instead (.mmd-svg is an overflow-x: auto box).
 */

/** 0.8 × the 15px mermaid font = 12px, the floor we're willing to render at. */
export const MIN_LEGIBLE_SCALE = 0.8

/**
 * The width to render an SVG at, given its natural (viewBox) width and the
 * width available.
 *
 * - fits already → natural size (never stretch a small diagram to fill)
 * - slightly too wide → the container, shrinking no further than minScale
 * - far too wide → minScale of natural, and the container scrolls
 */
export function fitWidth(natural: number, container: number, minScale = MIN_LEGIBLE_SCALE): number {
  // Degenerate inputs: a container of 0 shows up on the first layout pass and
  // during jsdom tests, and must not collapse the diagram to nothing.
  if (!Number.isFinite(natural) || natural <= 0) return container > 0 ? container : 0
  if (!Number.isFinite(container) || container <= 0) return natural
  if (natural <= container) return natural
  return Math.max(container, Math.ceil(natural * minScale))
}

/** The scale `fitWidth` results in — the factor mermaid's 15px label is multiplied by. */
export function fitScale(natural: number, container: number, minScale = MIN_LEGIBLE_SCALE): number {
  if (!Number.isFinite(natural) || natural <= 0) return 1
  return fitWidth(natural, container, minScale) / natural
}
