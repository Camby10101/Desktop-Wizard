// Settings → Start with Windows: whether Windows will really start the app when the user signs in.

/** What Windows says about starting the app at sign-in (Electron's app.getLoginItemSettings()). */
export interface LoginItem {
  /** Its entry is in the list of programs Windows starts at sign-in. */
  openAtLogin: boolean
  /**
   * Windows' own records of switching that entry on or off (Settings → Apps → Startup, or Task
   * Manager's Startup apps), as Electron finds them. Windows makes one only once the switch there
   * has been used; with none, the entry is on. Windows only.
   */
  launchItems?: readonly { enabled: boolean }[]
}

/**
 * Whether Windows will start the app at sign-in: its entry is there, and not switched off in
 * Windows' own Startup apps, which leaves the entry in the list but skips it (so the switch in
 * Settings would wrongly show on). Electron's `executableWillLaunchAtLogin` isn't used: it says no
 * for an entry Windows has no record for yet, which Windows starts all the same.
 */
export const startsAtSignIn = (item: LoginItem): boolean =>
  item.openAtLogin &&
  (item.launchItems === undefined ||
    item.launchItems.length === 0 ||
    item.launchItems.some((record) => record.enabled))
