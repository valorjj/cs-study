import GithubSlugger, { slug } from 'github-slugger'

export function parseNoteRef(ref: string): { path: string; anchor: string | null } {
  const [rawPath, anchor] = ref.split('#')
  const path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`
  return { path, anchor: anchor ?? null }
}

export interface NoteSection {
  heading: string   // H1 heading text (without leading "# "), used as tab label
  slug: string      // github-slugger slug of the heading, matches noteRef anchors
  body: string      // markdown body of the section (heading line excluded)
}

export interface ParsedNote {
  title: string           // first H1 = note title
  sections: NoteSection[] // subsequent H1s = tabbed sections
}

// Split a note's markdown into tabbable sections by top-level (H1) headings.
// The first H1 is the note title; content before the first *section* H1
// (e.g. the "## 목차" table-of-contents block) is dropped. Each later H1
// starts a section whose body excludes the heading line (the tab shows it).
export function parseSections(md: string): ParsedNote {
  const lines = md.split('\n')
  const h1 = /^# (?!#)(.*)$/ // exactly one '#' then a space
  const fence = /^\s*(```|~~~)/ // fenced code block delimiter
  let inFence = false
  let title = ''
  let started = false
  const sections: NoteSection[] = []
  let current: { heading: string; bodyLines: string[] } | null = null

  const flush = () => {
    if (!current) return
    sections.push({
      heading: current.heading,
      slug: slug(current.heading),
      body: current.bodyLines.join('\n').trim(),
    })
    current = null
  }

  for (const line of lines) {
    if (fence.test(line)) inFence = !inFence
    // '#' comment lines inside code fences (e.g. Dockerfile/shell) are not headings
    const m = inFence ? null : h1.exec(line)
    if (m) {
      const heading = m[1].trim()
      if (!started) {
        title = heading   // first H1 = title; drop preamble (목차) that follows
        started = true
        continue
      }
      flush()
      current = { heading, bodyLines: [] }
      continue
    }
    if (current) current.bodyLines.push(line)
    // lines before the first section H1 (the 목차 preamble) are ignored
  }
  flush()
  return { title, sections }
}

export interface OutlineItem {
  depth: 2 | 3
  text: string
  slug: string
}

// Extract H2/H3 sub-headings from a section body for an in-page outline (TOC).
// Fence-aware (same guard as parseSections). Slugs come from a GithubSlugger
// instance walked in document order, so they match the ids rehype-slug assigns
// when the same body is rendered (including -1/-2 dedup suffixes).
export function extractOutline(body: string): OutlineItem[] {
  const lines = body.split('\n')
  const fence = /^\s*(```|~~~)/
  const heading = /^(#{2,3}) (?!#)(.*)$/
  let inFence = false
  const slugger = new GithubSlugger()
  const out: OutlineItem[] = []
  for (const line of lines) {
    if (fence.test(line)) { inFence = !inFence; continue }
    if (inFence) continue
    const m = heading.exec(line)
    if (!m) continue
    const text = m[2].trim()
    out.push({ depth: m[1].length as 2 | 3, text, slug: slugger.slug(text) })
  }
  return out
}
