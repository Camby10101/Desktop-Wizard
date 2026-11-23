# Desktop Wizard on macOS

Desktop Wizard began on Windows, and now runs on Macs too. This is how the two are kept, where each
feature stands on a Mac, and what's still to do.

## One codebase, separate downloads

Windows and macOS share one codebase on one branch (`main`), not a branch or a folder each:

- **Most of the app is the same on both.** The character, her habits and animations, the panel,
  the chat, Jira, the service desk, the Apps list, spells, the screen saver, settings: all of it is
  web code and Node code that Electron runs the same way on Windows and macOS. Copying it into a
  `windows/` and a `mac/` folder, or keeping it on two branches, would mean making every change
  twice, and the two would drift apart within weeks.
- **What differs is small, and kept in two places**, so it's easy to find and nothing else needs
  to know:
  - `apps/desktop/src/shared/platform.ts` says what works on each OS and what things are called
    there (`OS_FEATURES`: "Start with Windows" or "Open at login", Ctrl+V or ⌘V, and whether each
    Windows-only feature is available). The pages read it too, to show the right settings.
  - `apps/desktop/src/main/platform.ts` makes the Electron calls that differ: the app's ID on
    Windows, no Dock icon on a Mac, how the overlay windows are kept on top, how an update is
    installed (Windows' installer, or the Mac zip: `macUpdate.ts`) and how the app is uninstalled.
  - A feature that needs real OS-specific code (looking at the taskbar or Dock, say) gets an
    implementation for each OS behind one interface, chosen by `OS`, the way `ShellProbe` is used
    now (for Windows only).
- **Both are built from the same commit**: `npm run dist` makes the Windows installer (on the PC),
  and GitHub Actions makes the Mac app for each release on one of GitHub's Macs
  (`.github/workflows/mac.yml`, running `npm run dist:mac`: Apple's tools only run on macOS), so no
  Mac is needed to release.
- **The downloads are kept separate on GitHub**: the Windows installer in `installer/windows/` (and
  on each release), the Mac app on each release only (a universal app for Apple silicon and Intel is
  over the 100 MB GitHub takes for a file in a repository). Each OS's copies update from their own
  file on the release: Windows' `…Setup….exe`, a Mac's `…-mac.zip`.

## Where each feature stands

| Feature                                                  | Windows                    | macOS                                                                                                                                          |
| -------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Her, her habits, walking, dragging, throwing, petting    | yes                        | yes (shared code); she stands on the screen's work area, above the Dock                                                                        |
| The panel, chat, Apps, Jira, service desk, notifications | yes                        | yes (shared code)                                                                                                                              |
| Spells, the screen saver, the familiar, her battle       | yes                        | yes (shared code); the screen saver covers every Space                                                                                         |
| Kept on top of other windows, off the taskbar / Dock     | toolbar windows            | on every Space and over full-screen apps; no Dock icon (`LSUIElement`)                                                                         |
| Start at login                                           | Start with Windows         | Open at login (Electron's login item)                                                                                                          |
| Screenshots                                              | yes                        | yes, once the user allows **Screen Recording** for Desktop Wizard (System Settings → Privacy & Security)                                       |
| Questions to Claude Desktop                              | filled in and sent         | filled in (the `claude://` link); the user presses Return                                                                                      |
| Taskbar tricks, peeking round windows, portals           | yes (UI Automation)        | not yet: needs a Mac version of the shell probe                                                                                                |
| Hide in full-screen apps                                 | yes                        | not yet (same probe); she stays over full-screen apps                                                                                          |
| Check for updates                                        | yes (the signed installer) | yes: the release's `-mac.zip`, checked against the release key, replaces the app and opens it                                                  |
| Uninstall from Settings                                  | yes                        | yes: moves the app to the Bin                                                                                                                  |
| Signed                                                   | the release key (updates)  | ad hoc (Apple silicon only runs signed apps), not by Apple: macOS asks to allow it the first time; updates are checked against the release key |
| Built for each release                                   | `npm run dist`, on the PC  | GitHub Actions, on one of GitHub's Macs, attached to the release                                                                               |

## Installing it on a Mac

1. Download `Desktop.Wizard-<version>-mac.dmg` from the newest release, open it, and drag Desktop
   Wizard into **Applications** (it must run from there to update itself).
2. Open it from Applications. It isn't signed by Apple, so macOS says it can't check it for
   malicious software: choose **Done**, then open **System Settings → Privacy & Security**, and next
   to "Desktop Wizard was blocked", click **Open Anyway** (once; macOS 14 and earlier also let you
   right-click it and choose **Open**). From then on it opens normally, and Check for updates
   installs new versions itself.
3. The first screenshot asks for **Screen Recording** permission; allow it in System Settings →
   Privacy & Security, and start Desktop Wizard again.

## Building and trying it

- **On GitHub**: the Mac build runs for each release (see [RELEASING.md](RELEASING.md)), or by hand
  from the Actions tab (**Mac build → Run workflow**, with a release's tag), and attaches the Mac app
  to the release.
- **On a Mac**, with Node 24: clone the repository, `npm install`, then `npm run dev` to run it, or
  `npm run dist:mac` to build `apps/desktop/dist/Desktop Wizard-<version>-mac.dmg` (and the `.zip`).
- **Updating**, which can't be tried from Windows: the script that replaces the app
  (`INSTALL_SCRIPT` in `apps/desktop/src/main/macUpdate.ts`) has been run against stand-ins for
  macOS's tools: it puts the new app in place, waits for Desktop Wizard to quit first, changes
  nothing if the zip won't unpack, and puts the old app back if the new one can't be moved in.

What to look at first on a Mac, which couldn't be checked from Windows:

- She stands on the bottom of the screen, above the Dock, and stays on top: over other apps, on
  every desktop (Space), and over a full-screen app.
- Clicking her opens the panel, and typing in it works (no Dock icon can change how the focus
  moves on a Mac).
- Dragging and throwing her, between two screens too.
- The menu-bar icon (the tray): the company's icon in colour for now; Mac menu-bar icons are
  usually a single-colour "template" image.
- The screen saver over every screen, and waking it.
- Check for updates, from one release to the next.

## Still to do

In order:

1. **Try it on a Mac** and fix what the list above turns up (the first Mac build on GitHub Actions
   will also show whether it builds cleanly there).
2. **The shell probe on a Mac**, for her tricks and peeks, and hiding in full-screen apps: the
   windows on the screen and which is in front (`CGWindowListCopyWindowInfo`, through a small Swift
   helper or `osascript`), and the Dock's icons for the taskbar tricks (the Accessibility API, which
   needs the user's permission).
3. **Sending in Claude Desktop** on a Mac: pressing Return for the user through System Events, with
   the user's Accessibility permission, once it can check Claude's message box has the question.
4. **A menu-bar icon** made for the Mac: a single-colour "template" image.

Not planned: signing with an Apple Developer ID (and Apple's notarization). Without it, macOS asks
people to allow Desktop Wizard the first time they open it; updates are checked against the release
key instead, as on Windows.
