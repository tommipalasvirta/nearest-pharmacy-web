import { useMemo, useState } from 'react'
import type { OpenStatus } from '../lib/openingHours'
import type { Pharmacy } from '../lib/types'

/**
 * The "Open now" filter. When it is on, only pharmacies known to be open are
 * left; one without usable opening hours cannot be promised to be open, so it
 * is left out too.
 *
 * The filtered list keeps its identity until the set of open pharmacies
 * changes, so the minute-by-minute refresh of opening hours does not make the
 * map redraw its pins.
 */
export function useOpenNowFilter(pharmacies: Pharmacy[], openStatuses: Map<string, OpenStatus> | undefined) {
  const [openOnly, setOpenOnly] = useState(false)

  const openIds = pharmacies
    .filter((pharmacy) => openStatuses?.get(pharmacy.id)?.isOpen)
    .map((pharmacy) => pharmacy.id)
    .join('\n')

  const visible = useMemo(() => {
    if (!openOnly) return pharmacies
    const open = new Set(openIds.split('\n'))
    return pharmacies.filter((pharmacy) => open.has(pharmacy.id))
  }, [pharmacies, openOnly, openIds])

  return { openOnly, setOpenOnly, visible }
}
