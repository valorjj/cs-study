import { slug } from 'github-slugger'

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
    const m = h1.exec(line)
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
