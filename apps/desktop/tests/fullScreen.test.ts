import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Rect } from '@shared/geometry'
import { FULL_SCREEN_CHECK_MS, FullScreenWatch, fullScreenOver } from '../src/main/fullScreen'
import type { Foreground } from '../src/main/shell/probe'

const LAPTOP = { x: 0, y: 0, width: 1920, height: 1080 }
const WIDE = { x: -750, y: -1440, width: 3440, height: 1440 }
const identity = (r: Rect) => r
/** Her window standing on the laptop's taskbar, or the wide screen's. */
const onLaptop = { x: 1700, y: 870, width: 96, height: 104 }
const onWide = { x: -600, y: -256, width: 96, height: 104 }

/** The window in front, covering `rect` on `monitor`. */
function front(rect: Rect, monitor: Rect, extra: Partial<NonNullable<Foreground['window']>> = {}) {
  return {
    state: 5,
    window: {
      handle: 1,
      pid: 50,
      className: 'Chrome_WidgetWin_1',
      captioned: false,
      rect,
      monitor,
      ...extra,
    },
  } satisfies Foreground
}

describe('a full-screen app in front', () => {
  it('is one filling her whole screen, taskbar and all, without a title bar', () => {
    expect(fullScreenOver(front(LAPTOP, LAPTOP), onLaptop, 99, identity)).toBe(true)
    // A little past the edges, as some do, still counts.
    const over = { x: -8, y: -8, width: 1936, height: 1096 }
    expect(fullScreenOver(front(over, LAPTOP), onLaptop, 99, identity)).toBe(true)
  })

  it('only on her screen: one filling the other screen leaves her be', () => {
    expect(fullScreenOver(front(LAPTOP, LAPTOP), onWide, 99, identity)).toBe(false)
    expect(fullScreenOver(front(WIDE, WIDE), onWide, 99, identity)).toBe(true)
  })

  it('isn’t a maximised window (it has a title bar, and stops at the taskbar)', () => {
    const maximised = { x: -8, y: -8, width: 1936, height: 1036 }
    expect(fullScreenOver(front(maximised, LAPTOP), onLaptop, 99, identity)).toBe(false)
    // Even covering the screen (with the taskbar set to hide), its title bar gives it away.
    expect(fullScreenOver(front(LAPTOP, LAPTOP, { captioned: true }), onLaptop, 99, identity)).toBe(
      false,
    )
  })

  it('isn’t the desktop, the Start menu, the task switcher or her own windows', () => {
    for (const className of [
      'Progman',
      'WorkerW',
      'Windows.UI.Core.CoreWindow',
      'XamlExplorerHostIslandWindow',
    ]) {
      expect(fullScreenOver(front(LAPTOP, LAPTOP, { className }), onLaptop, 99, identity)).toBe(
        false,
      )
    }
    expect(fullScreenOver(front(LAPTOP, LAPTOP, { pid: 99 }), onLaptop, 99, identity)).toBe(false)
  })

  it('counts a game or presentation Windows says has her screen, and nothing while locked', () => {
    const windowed = { x: 100, y: 100, width: 800, height: 600 }
    const game = { ...front(windowed, LAPTOP), state: 3 }
    const presenting = { ...front(windowed, LAPTOP), state: 4 }
    expect(fullScreenOver(game, onLaptop, 99, identity)).toBe(true)
    expect(fullScreenOver(presenting, onLaptop, 99, identity)).toBe(true)
    expect(fullScreenOver({ ...front(LAPTOP, LAPTOP), state: 1 }, onLaptop, 99, identity)).toBe(
      false,
    )
    expect(fullScreenOver({ state: 5, window: null }, onLaptop, 99, identity)).toBe(false)
  })
})

describe('FullScreenWatch', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('checks every couple of seconds while on, telling her each time, and stops when turned off', async () => {
    let now: Foreground = front(LAPTOP, LAPTOP)
    const told: boolean[] = []
    const watch = new FullScreenWatch({
      foreground: async () => now,
      her: () => onLaptop,
      ownPid: 99,
      toDip: identity,
      onCheck: (on) => told.push(on),
    })
    watch.set(true)
    await vi.advanceTimersByTimeAsync(10)
    expect(told).toEqual([true])
    await vi.advanceTimersByTimeAsync(FULL_SCREEN_CHECK_MS)
    expect(told).toEqual([true, true]) // told again, in case she was busy last time
    now = { state: 5, window: null }
    await vi.advanceTimersByTimeAsync(FULL_SCREEN_CHECK_MS)
    expect(told.at(-1)).toBe(false)
    watch.set(false)
    expect(told.at(-1)).toBe(false) // turned off: she comes back
    const count = told.length
    await vi.advanceTimersByTimeAsync(FULL_SCREEN_CHECK_MS * 5)
    expect(told).toHaveLength(count)
  })

  it('carries on when the shell doesn’t answer, and stops for good when disposed', async () => {
    let fail = true
    const told: boolean[] = []
    const watch = new FullScreenWatch({
      foreground: async () => {
        if (fail) throw new Error('no answer')
        return front(LAPTOP, LAPTOP)
      },
      her: () => onLaptop,
      ownPid: 99,
      toDip: identity,
      onCheck: (on) => told.push(on),
    })
    watch.set(true)
    await vi.advanceTimersByTimeAsync(10)
    expect(told).toEqual([])
    fail = false
    await vi.advanceTimersByTimeAsync(FULL_SCREEN_CHECK_MS)
    expect(told).toEqual([true])
    watch.dispose()
    await vi.advanceTimersByTimeAsync(FULL_SCREEN_CHECK_MS * 5)
    expect(told).toEqual([true])
  })
})
