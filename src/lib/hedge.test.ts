import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { firstSuccessful } from './hedge'

describe('firstSuccessful', () => {
  beforeEach(() => void vi.useFakeTimers())
  afterEach(() => void vi.useRealTimers())

  const after = <T>(ms: number, value: T) => () =>
    new Promise<T>((resolve) => setTimeout(() => resolve(value), ms))

  /** Never answers; rejects only when its request is aborted. */
  const hanging = (signal: AbortSignal) =>
    new Promise<string>((_resolve, reject) =>
      signal.addEventListener('abort', () => reject(signal.reason)),
    )

  it('does not start the fallback when the first attempt answers in time', async () => {
    const fallback = vi.fn(after(0, 'fallback'))
    const race = firstSuccessful([after(1000, 'primary'), fallback], 4000)
    await vi.advanceTimersByTimeAsync(1000)
    await expect(race).resolves.toBe('primary')
    expect(fallback).not.toHaveBeenCalled()
  })

  it('starts the fallback after the head start and takes whichever answers first', async () => {
    const race = firstSuccessful([after(30_000, 'slow primary'), after(500, 'fallback')], 4000)
    await vi.advanceTimersByTimeAsync(4500)
    await expect(race).resolves.toBe('fallback')
  })

  it('still lets a slow first attempt win if it beats the fallback', async () => {
    const race = firstSuccessful([after(5000, 'primary'), after(3000, 'fallback')], 4000)
    await vi.advanceTimersByTimeAsync(5000)
    await expect(race).resolves.toBe('primary')
  })

  it('aborts the losing attempt once there is a winner', async () => {
    let loserSignal: AbortSignal | undefined
    const primary = (signal: AbortSignal) => {
      loserSignal = signal
      return hanging(signal)
    }
    const race = firstSuccessful([primary, after(100, 'fallback')], 4000)
    await vi.advanceTimersByTimeAsync(4100)
    await expect(race).resolves.toBe('fallback')
    expect(loserSignal?.aborted).toBe(true)
  })

  it('rejects straight away when the caller cancels', async () => {
    const controller = new AbortController()
    const fallback = vi.fn(after(0, 'fallback'))
    const race = firstSuccessful([hanging, fallback], 4000, controller.signal)
    const outcome = expect(race).rejects.toThrow()
    controller.abort()
    await outcome
    await vi.advanceTimersByTimeAsync(10_000)
    expect(fallback).not.toHaveBeenCalled()
  })

  it('gives each fallback its head start, even when an older attempt fails meanwhile', async () => {
    const failingAfter = (ms: number) => () =>
      new Promise<string>((_resolve, reject) => setTimeout(() => reject(new Error('down')), ms))
    const third = vi.fn(after(0, 'third'))
    const race = firstSuccessful([failingAfter(1500), hanging, third], 1000)

    // The second attempt started at 1000 ms; the first failing at 1500 ms changes nothing.
    await vi.advanceTimersByTimeAsync(1900)
    expect(third).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(200)
    await expect(race).resolves.toBe('third')
  })

  it('rejects with every error when all attempts fail', async () => {
    const failing = async () => {
      throw new Error('down')
    }
    await expect(firstSuccessful([failing, failing], 1000)).rejects.toThrow('Every attempt failed')
  })
})
