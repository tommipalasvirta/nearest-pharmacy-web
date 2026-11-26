/** OSM `website` tags often omit the scheme ("apteekki.fi"); links need one. */
export function normalizeUrl(url: string | undefined): string | undefined {
  if (!url) return undefined
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}
