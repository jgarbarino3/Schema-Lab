export const MAX_RECENT_ITEMS = 6
export const RECENT_PREVIEW_COUNT = 2
export const LIBRARY_RECENTS_CLEAR_EVENT = 'schema-lab:clear-library-recents'

export type RecentEntry =
  | { kind: 'breadboard'; id: string }
  | { kind: 'component'; id: string; variantId?: string }

let recentEntriesCache: RecentEntry[] = []

export function readRecentEntries() {
  return recentEntriesCache
}

export function writeRecentEntries(entries: RecentEntry[]) {
  recentEntriesCache = entries
}

export function dispatchClearLibraryRecents() {
  recentEntriesCache = []

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(LIBRARY_RECENTS_CLEAR_EVENT))
  }
}
