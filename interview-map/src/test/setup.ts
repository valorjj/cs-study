import '@testing-library/jest-dom'

// Node 22+'s built-in experimental global `localStorage` is a non-functional
// stub without --localstorage-file (throws "clear is not a function") and it
// shadows jsdom's own implementation. Replace it with a minimal in-memory
// Storage so tests can use localStorage normally.
if (typeof globalThis.localStorage?.clear !== 'function') {
  class MemoryStorage implements Storage {
    private store = new Map<string, string>()
    getItem(key: string): string | null {
      return this.store.has(key) ? this.store.get(key)! : null
    }
    setItem(key: string, value: string): void {
      this.store.set(key, String(value))
    }
    removeItem(key: string): void {
      this.store.delete(key)
    }
    clear(): void {
      this.store.clear()
    }
    key(index: number): string | null {
      return Array.from(this.store.keys())[index] ?? null
    }
    get length(): number {
      return this.store.size
    }
  }
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  })
}
