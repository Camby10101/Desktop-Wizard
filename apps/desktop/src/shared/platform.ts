// The operating systems Desktop Wizard runs on, what works on each, and what things are called
// there. One codebase serves both: the rest of the app asks here (and src/main/platform.ts for the
// Electron side) rather than checking the OS itself, so what differs is in one place. Desktop Wizard
// began on Windows; macOS support is new, and the features still Windows-only are marked here (see
// docs/MAC.md for the plan for each).

export type OsName = 'windows' | 'mac'

/** The OS for Node's `process.platform`: macOS is `darwin`; anything else is treated as Windows. */
export const osOf = (platform: string): OsName => (platform === 'darwin' ? 'mac' : 'windows')

/** What works on an OS, and what it's called there. */
export interface OsFeatures {
  /** The OS's name, as people say it. */
  name: string
  /** Settings' name for starting the app when the user signs in. */
  startAtLogin: string
  /** The paste shortcut, as it's written in messages. */
  pasteKeys: string
  /**
   * Looking at the OS's shell (the taskbar's buttons, the windows on the screen, the window in
   * front): her taskbar tricks, peeks, portals and hiding in full-screen apps.
   */
  shellProbe: boolean
  /** Pressing send in Claude Desktop for the user (Settings → Send in Claude automatically). */
  sendInClaude: boolean
  /** Settings → Check for updates: downloading and installing the new version. */
  updates: boolean
  /** Settings → Uninstall. */
  uninstall: boolean
}

export const OS_FEATURES = {
  windows: {
    name: 'Windows',
    startAtLogin: 'Start with Windows',
    pasteKeys: 'Ctrl+V',
    shellProbe: true,
    sendInClaude: true,
    updates: true,
    uninstall: true,
  },
  mac: {
    name: 'macOS',
    startAtLogin: 'Open at login',
    pasteKeys: '⌘V',
    // Windows' UI Automation has no macOS counterpart here yet (docs/MAC.md).
    shellProbe: false,
    sendInClaude: false,
    // The updater installs Windows' installer; on a Mac, new versions are downloaded by hand.
    updates: false,
    // An app is uninstalled on a Mac by dragging it from Applications to the Bin.
    uninstall: false,
  },
} as const satisfies Record<OsName, OsFeatures>
