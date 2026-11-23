import { dirname } from 'node:path'

// Installing an update on a Mac. Apple's own updater (Squirrel.Mac) only takes apps signed with an
// Apple Developer ID, which Desktop Wizard isn't; but like the Windows installer, the update's zip
// is checked against the release key before anything runs (updates.ts). This unpacks it and puts
// the new app where the old one is, once Desktop Wizard has quit, then opens it.

/**
 * The .app a Mac copy runs from (…/Desktop Wizard.app/Contents/MacOS/Desktop Wizard), or null if
 * it isn't one it can replace: not in an app bundle, run from its disk image (/Volumes), or opened
 * where it was downloaded, which macOS runs from a hidden copy elsewhere (App Translocation).
 */
export function appBundleOf(execPath: string): string | null {
  const bundle = /^(\/.+\.app)\/Contents\/MacOS\/[^/]+$/.exec(execPath)?.[1]
  if (!bundle || bundle.includes('/AppTranslocation/') || bundle.startsWith('/Volumes/')) {
    return null
  }
  return bundle
}

/**
 * Replaces the app with the update, run on its own by /bin/sh once Desktop Wizard has handed over:
 * $1 the update's zip, $2 the app, $3 a folder to unpack it in, $4 Desktop Wizard's process. It
 * unpacks the zip (ditto keeps the app's links and permissions), waits for Desktop Wizard to quit,
 * moves the old app aside and the new one into its place (putting the old one back if that fails),
 * and opens it. Paths come in as arguments, never written into the script.
 */
export const INSTALL_SCRIPT = `zip="$1"; app="$2"; staging="$3"; pid="$4"
rm -rf "$staging" && mkdir -p "$staging" || exit 1
ditto -x -k "$zip" "$staging/new" || exit 1
new=$(ls -d "$staging"/new/*.app 2>/dev/null | head -n 1)
[ -n "$new" ] || exit 1
xattr -dr com.apple.quarantine "$new" 2>/dev/null
while kill -0 "$pid" 2>/dev/null; do sleep 0.5; done
mv "$app" "$staging/previous.app" || exit 1
if mv "$new" "$app"; then rm -rf "$staging/previous.app"; else mv "$staging/previous.app" "$app"; fi
open "$app"
`

export interface MacInstallDeps {
  /** The app to replace (appBundleOf the running copy), or null if it can't be. */
  bundle: string | null
  /** This app's process, which the script waits for to end. */
  pid: number
  /** A folder of its own to unpack the update in. */
  staging: string
  /** Whether the folder the app is in can be changed by this user. */
  writable(folder: string): boolean
  /** Starts a command on its own, so it carries on once this app has quit. */
  runDetached(command: string, args: string[]): void
}

/**
 * Starts replacing the app with the update in `zip` (already checked against the release key):
 * the script waits for Desktop Wizard to quit, which the updater then does. Throws, changing
 * nothing, if the app isn't somewhere it can be replaced.
 */
export function installMacUpdate(zip: string, deps: MacInstallDeps): void {
  if (!deps.bundle) {
    throw new Error(
      "Desktop Wizard isn't in Applications, so it can't update itself: move it to Applications, open it from there, and try again",
    )
  }
  const folder = dirname(deps.bundle)
  if (!deps.writable(folder)) {
    throw new Error(`Desktop Wizard can't change ${folder} to update itself`)
  }
  deps.runDetached('/bin/sh', [
    '-c',
    INSTALL_SCRIPT,
    'desktop-wizard-update',
    zip,
    deps.bundle,
    deps.staging,
    String(deps.pid),
  ])
}
