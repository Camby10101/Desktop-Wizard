import { describe, expect, it } from 'vitest'
import { startsAtSignIn } from '../src/main/autoStart'

describe('Start with Windows', () => {
  it('is on when her entry is there and Windows has no record of it switched off', () => {
    // As Electron reports an installed copy that Windows' Startup apps has never been used on.
    expect(startsAtSignIn({ openAtLogin: true, launchItems: [] })).toBe(true)
    expect(startsAtSignIn({ openAtLogin: true })).toBe(true)
    expect(startsAtSignIn({ openAtLogin: true, launchItems: [{ enabled: true }] })).toBe(true)
  })

  it('shows off when the entry is there but switched off in Windows’ own Startup apps', () => {
    expect(startsAtSignIn({ openAtLogin: true, launchItems: [{ enabled: false }] })).toBe(false)
  })

  it('is off without the entry, whatever Windows remembers', () => {
    expect(startsAtSignIn({ openAtLogin: false, launchItems: [] })).toBe(false)
    expect(startsAtSignIn({ openAtLogin: false, launchItems: [{ enabled: true }] })).toBe(false)
  })
})
