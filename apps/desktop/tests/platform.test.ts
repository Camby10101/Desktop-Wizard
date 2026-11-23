import { describe, expect, it } from 'vitest'
import { OS_FEATURES, osOf } from '@shared/platform'
import { extraTextHint, pasteHint } from '../src/main/claudeDesktop'

describe('the operating systems', () => {
  it('treats darwin as macOS, and anything else as Windows', () => {
    expect(osOf('darwin')).toBe('mac')
    expect(osOf('win32')).toBe('windows')
    expect(osOf('linux')).toBe('windows')
  })

  it('keeps every feature on Windows, as it was before Mac support', () => {
    const windows = OS_FEATURES.windows
    expect([windows.shellProbe, windows.sendInClaude, windows.updates]).toEqual([true, true, true])
    expect(windows.startAtLogin).toBe('Start with Windows')
    expect(windows.pasteKeys).toBe('Ctrl+V')
  })

  it('names things as each OS does, and says what a Mac can’t do yet', () => {
    expect(OS_FEATURES.mac.startAtLogin).toBe('Open at login')
    expect(OS_FEATURES.mac.pasteKeys).toBe('⌘V')
    // Windows-only for now (docs/MAC.md has the plan for each).
    expect(OS_FEATURES.mac.shellProbe).toBe(false)
    expect(OS_FEATURES.mac.sendInClaude).toBe(false)
    // Updates are checked against the release key, as on Windows: no Apple Developer ID needed.
    expect(OS_FEATURES.mac.updates).toBe(true)
  })

  it('tells people the paste shortcut of their OS', () => {
    expect(pasteHint(1).body).toContain('Ctrl+V')
    expect(pasteHint(1, OS_FEATURES.mac.pasteKeys).body).toContain('⌘V')
    expect(extraTextHint(1, OS_FEATURES.mac.pasteKeys).body).toContain('⌘V')
    expect(extraTextHint(0, OS_FEATURES.mac.pasteKeys).body).not.toContain('⌘V')
  })
})
