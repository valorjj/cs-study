import { describe, it, expect } from 'vitest'
import { parseNoteRef } from './notes'

describe('parseNoteRef', () => {
  it('splits path and anchor', () => {
    expect(parseNoteRef('notes/01-java-jvm/jvm-memory-gc.md#t2-garbage-collection'))
      .toEqual({ path: '/notes/01-java-jvm/jvm-memory-gc.md', anchor: 't2-garbage-collection' })
  })
  it('handles missing anchor', () => {
    expect(parseNoteRef('notes/01-java-jvm/hashmap-internals.md'))
      .toEqual({ path: '/notes/01-java-jvm/hashmap-internals.md', anchor: null })
  })
  it('normalizes an already-leading-slash path', () => {
    expect(parseNoteRef('/notes/a.md#x')).toEqual({ path: '/notes/a.md', anchor: 'x' })
  })
})
