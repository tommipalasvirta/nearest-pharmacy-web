import { describe, expect, it } from 'vitest'
import { formatDistance, haversineMeters } from './geo'

const HELSINKI = { lat: 60.1699, lon: 24.9384 }
const TAMPERE = { lat: 61.4978, lon: 23.761 }

describe('haversineMeters', () => {
  it('is zero for the same point', () => {
    expect(haversineMeters(HELSINKI, HELSINKI)).toBe(0)
  })

  it('matches the known Helsinki–Tampere distance', () => {
    expect(haversineMeters(HELSINKI, TAMPERE) / 1000).toBeCloseTo(160.9, 0)
  })

  it('is symmetric', () => {
    expect(haversineMeters(HELSINKI, TAMPERE)).toBeCloseTo(haversineMeters(TAMPERE, HELSINKI), 6)
  })

  it('measures one degree of latitude as about 111 km', () => {
    expect(haversineMeters({ lat: 0, lon: 0 }, { lat: 1, lon: 0 }) / 1000).toBeCloseTo(111.2, 1)
  })
})

describe('formatDistance', () => {
  it.each([
    [4, '10 m'],
    [347, '350 m'],
    [994, '990 m'],
    [996, '1.0 km'],
    [1_240, '1.2 km'],
    [9_960, '10 km'],
    [14_300, '14 km'],
  ])('formats %d m as %s', (meters, expected) => {
    expect(formatDistance(meters)).toBe(expected)
  })
})
