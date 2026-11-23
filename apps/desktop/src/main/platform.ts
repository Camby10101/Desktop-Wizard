import { app, shell, type BrowserWindow, type BrowserWindowConstructorOptions } from 'electron'
import { spawn } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { join } from 'node:path'
import { OS_FEATURES, osOf, type OsFeatures, type OsName } from '@shared/platform'
import type { UninstallResult } from '@shared/types'
import { appBundleOf, installMacUpdate } from './macUpdate'
import { uninstall, uninstallMac } from './uninstall'
import { INSTALLER_ARGS, MAC_UPDATE, WINDOWS_UPDATE } from './updates'

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

/** Which of a release's files is this OS's update, and what kind of file it is when downloaded. */
export const UPDATE_FILE = OS === 'mac' ? MAC_UPDATE : WINDOWS_UPDATE
export const UPDATE_KIND = OS === 'mac' ? /\.zip$/i : /\.exe$/i

/** The .app a Mac copy runs from, if it can be replaced or moved to the Bin (see appBundleOf). */
const macBundle = () => appBundleOf(app.getPath('exe'))

/** Starts a command on its own, so it carries on once this app has quit. */
const runDetached = (command: string, args: string[]) =>
  spawn(command, args, { detached: true, stdio: 'ignore' }).unref()

/**
 * Installs a downloaded update, already checked against the release key, which carries on once
 * this app quits. On Windows the installer replaces the app and starts it again; on a Mac the
 * zip's app takes the old one's place, and is opened (macUpdate.ts).
 */
export function installUpdate(path: string): void {
  if (OS === 'windows') return runDetached(path, INSTALLER_ARGS)
  installMacUpdate(path, {
    bundle: macBundle(),
    pid: process.pid,
    staging: join(app.getPath('temp'), 'Desktop Wizard update'),
    writable: (folder) => {
      try {
        accessSync(folder, constants.W_OK)
        return true
      } catch {
        return false
      }
    },
    runDetached,
  })
}

/**
 * Settings → Uninstall: on Windows, the uninstaller (next to the .exe); on a Mac, the app to the
 * Bin, as dragging it there does. Either way she stops starting at login, and her data is kept.
 */
export function uninstallApp(
  productName: string,
  exists: (path: string) => boolean,
  quit: () => void,
  onError: (error: unknown) => void,
): UninstallResult | Promise<UninstallResult> {
  const stopStartingAtLogin = () => app.setLoginItemSettings({ openAtLogin: false })
  if (OS === 'mac') {
    return uninstallMac({
      isPackaged: app.isPackaged,
      bundle: macBundle(),
      stopStartingAtLogin,
      trash: (path) => shell.trashItem(path),
      quit,
      onError,
    })
  }
  return uninstall({
    isPackaged: app.isPackaged,
    exePath: app.getPath('exe'),
    productName,
    exists,
    stopStartingWithWindows: stopStartingAtLogin,
    runDetached: (path) => runDetached(path, []),
    quit,
    onError,
  })
}
