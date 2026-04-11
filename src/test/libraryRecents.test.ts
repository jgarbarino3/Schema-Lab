import { describe, expect, it } from 'vitest'
import {
  dispatchClearLibraryRecents,
  MAX_RECENT_ITEMS,
  readRecentEntries,
  RECENT_PREVIEW_COUNT,
  writeRecentEntries,
  type RecentEntry,
} from '../ui/libraryRecents'

describe('library recents session state', () => {
  it('keeps the compact preview count at two items', () => {
    expect(RECENT_PREVIEW_COUNT).toBe(2)
  })

  it('stores and clears recent entries in session memory only', () => {
    const entries: RecentEntry[] = Array.from({ length: MAX_RECENT_ITEMS }, (_, index) => ({
      kind: 'component',
      id: `component-${index + 1}`,
      variantId: `variant-${index + 1}`,
    }))

    writeRecentEntries(entries)
    expect(readRecentEntries()).toEqual(entries)

    dispatchClearLibraryRecents()
    expect(readRecentEntries()).toEqual([])
  })
})
