/** Shared fixtures for the data-layer tests. */

export const HELSINKI = { lat: 60.1699, lon: 24.9384 }

/** Roughly 111 m per 0.001° of latitude. */
export const north = (degrees: number) => ({ lat: HELSINKI.lat + degrees, lon: HELSINKI.lon })

export const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export const context = (fetchFn: typeof fetch) => ({ signal: new AbortController().signal, fetchFn })
