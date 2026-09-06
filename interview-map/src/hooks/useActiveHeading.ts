import { useEffect, useState, type RefObject } from 'react'

/**
 * The slug of the heading the reader is currently under.
 *
 * A plain scroll measurement rather than IntersectionObserver: "which section
 * am I in" is a question about the *last* heading above the fold, and an
 * observer only reports headings that are on screen — so it goes blank in the
 * middle of any section taller than the viewport, which most of these are.
 */
export function useActiveHeading(
  scrollRef: RefObject<HTMLElement | null>,
  slugs: readonly string[],
): string | null {
  const [active, setActive] = useState<string | null>(slugs[0] ?? null)
  // Re-subscribe when the heading set changes; join is cheap and stable.
  const key = slugs.join('|')

  useEffect(() => {
    const root = scrollRef.current
    const list = key ? key.split('|') : []
    if (!root || list.length === 0) { setActive(null); return }

    let frame = 0
    const measure = () => {
      frame = 0
      const top = root.getBoundingClientRect().top
      // A heading counts as "reached" once it is within 96px of the top of the
      // scroll port, so the rail advances as a heading settles under the bar
      // rather than only after it has scrolled away.
      const line = top + 96
      let current = list[0]
      for (const slug of list) {
        const el = root.querySelector(`[id="${CSS.escape(slug)}"]`)
        if (!el) continue
        if (el.getBoundingClientRect().top <= line) current = slug
        else break
      }
      setActive(current)
    }
    const onScroll = () => { frame ||= requestAnimationFrame(measure) }

    measure()
    root.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      root.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [scrollRef, key])

  return active
}
