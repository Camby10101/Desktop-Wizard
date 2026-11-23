import { app, type BrowserWindow, type BrowserWindowConstructorOptions } from 'electron'
import { OS_FEATURES, osOf, type OsFeatures, type OsName } from '@shared/platform'

// The main process's side of what differs between Windows and macOS: the OS this is, what works on
// it (shared/platform.ts), and the few Electron calls that are made differently. Everything else in
// the main process is the same on both.

/** The OS the app is running on. */
export const OS: OsName = osOf(process.platform)

/** What works on it, and what things are called there. */
export const FEATURES: OsFeatures = OS_FEATURES[OS]

/** The app's ID: Windows knows the install by it (and shows it on notifications). */
const APP_ID = 'com.morsemicro.desktopassist'

/**
 * Sets the app up for its OS before any window opens. On Windows, its ID (for notifications and
 * the taskbar). On a Mac, no Dock icon or ⌘Tab entry: she lives on the screen, as she does on
 * Windows, where her windows are kept off the taskbar (the Mac build also says so in its
 * Info.plist, LSUIElement, so it never shows even as it starts).
 */
export function setUpApp(): void {
  if (OS === 'windows') app.setAppUserModelId(APP_ID)
  else app.dock?.hide()
}

/**
 * The window options that make an overlay window (her, the panel, the effects) a tool window on
 * this OS. On Windows, a toolbar window: kept off the taskbar and Alt+Tab. On a Mac, an ordinary
 * window, which afterOverlayCreated() then puts on every Space.
 */
export function overlayOptions(): Partial<BrowserWindowConstructorOptions> {
  return OS === 'windows' ? { type: 'toolbar' } : {}
}

/**
 * Once an overlay window is made: on a Mac, it's shown on every Space (desktop) and over
 * full-screen apps, as an always-on-top window is on Windows, and left out of Mission Control.
 */
export function afterOverlayCreated(win: BrowserWindow): void {
  if (OS !== 'mac') return
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.setHiddenInMissionControl(true)
}
