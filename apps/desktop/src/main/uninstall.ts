import { dirname, join } from 'node:path'
import type { UninstallResult } from '@shared/types'

export interface UninstallDeps {
  /** Only an installed copy has an uninstaller; `npm run dev` doesn't. */
  isPackaged: boolean
  /** The running .exe, which the uninstaller sits next to. */
  exePath: string
  /** The installer's product name: the uninstaller is "Uninstall <productName>.exe". */
  productName: string
  exists(path: string): boolean
  /** Turns "Start with Windows" off, so no startup entry is left pointing at a deleted .exe. */
  stopStartingWithWindows(): void
  /** Starts the uninstaller on its own, so it carries on once this app has quit. */
  runDetached(path: string): void
  quit(): void
  onError?(error: unknown): void
}

/** Where electron-builder's installer puts the uninstaller: next to the app's .exe. */
export function uninstallerPath(exePath: string, productName: string): string {
  return join(dirname(exePath), `Uninstall ${productName}.exe`)
}

/**
 * Removes Desktop Wizard from this PC: starts its uninstaller (which shows its own progress and
 * takes the app, its Start menu shortcut and its uninstall entry away), then quits so the files
 * can be deleted. The data folder (%APPDATA%\Desktop Wizard: preferences, the text box, logs) and
 * the screenshots in Pictures are kept, as with any uninstall from Windows Settings.
 */
export function uninstall(deps: UninstallDeps): UninstallResult {
  if (!deps.isPackaged) return { ok: false, reason: 'not-installed' }
  const uninstaller = uninstallerPath(deps.exePath, deps.productName)
  if (!deps.exists(uninstaller)) return { ok: false, reason: 'missing' }
  try {
    deps.stopStartingWithWindows()
    deps.runDetached(uninstaller)
  } catch (error) {
    deps.onError?.(error)
    return { ok: false, reason: 'failed' }
  }
  deps.quit()
  return { ok: true }
}

export interface MacUninstallDeps {
  /** Only an installed copy can be moved to the Bin; `npm run dev` can't. */
  isPackaged: boolean
  /** The app (appBundleOf the running copy), or null if it isn't one that can be. */
  bundle: string | null
  /** Turns "Open at login" off, so no login item is left behind. */
  stopStartingAtLogin(): void
  /** Moves a file or folder to the Bin. */
  trash(path: string): Promise<void>
  quit(): void
  onError?(error: unknown): void
}

/**
 * Removes Desktop Wizard from this Mac the way a Mac user does: moves the app to the Bin (from
 * where it can still be put back), then quits. Its data (~/Library/Application Support/Desktop
 * Wizard) and the screenshots in Pictures are kept.
 */
export async function uninstallMac(deps: MacUninstallDeps): Promise<UninstallResult> {
  if (!deps.isPackaged) return { ok: false, reason: 'not-installed' }
  if (!deps.bundle) return { ok: false, reason: 'missing' }
  try {
    deps.stopStartingAtLogin()
    await deps.trash(deps.bundle)
  } catch (error) {
    deps.onError?.(error)
    return { ok: false, reason: 'failed' }
  }
  deps.quit()
  return { ok: true }
}
