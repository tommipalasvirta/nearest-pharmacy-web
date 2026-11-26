/** OSM tags can list several values ("+358 9 123; +358 9 456"); the first is used. */
export function firstValue(tag: string | undefined): string | undefined {
  return tag?.split(';')[0].trim() || undefined
}

/** OSM `website` tags often omit the scheme ("apteekki.fi"); links need one. */
export function normalizeUrl(tag: string | undefined): string | undefined {
  const url = firstValue(tag)
  if (!url) return undefined
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}
