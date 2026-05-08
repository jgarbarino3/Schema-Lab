export type OgSceneVariant = 'hero' | 'tutorial'

export function isOgModeSearch(search: string): boolean {
  const params = new URLSearchParams(search)
  const value = params.get('og')

  return value === '1'
}

export function getOgSceneVariant(search: string): OgSceneVariant {
  const params = new URLSearchParams(search)
  const value = params.get('og-scene')

  return value === 'hero' ? 'hero' : 'tutorial'
}
