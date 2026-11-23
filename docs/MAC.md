# Desktop Wizard on macOS

Desktop Wizard began on Windows. This is the plan for running it on Macs too, and where that work
stands.

## One codebase, one branch

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
  - `apps/desktop/src/main/platform.ts` makes the few Electron calls that differ (the app's ID on
    Windows, no Dock icon on a Mac, how the overlay windows are kept on top).
  - A feature that needs real OS-specific code (looking at the taskbar or Dock, say) gets an
    implementation for each OS behind one interface, chosen by `OS`, the way `ShellProbe` is used
    now (for Windows only).
- **Both are built from the same commit**: `npm run dist` makes the Windows installer (on Windows),
  and `npm run dist:mac` the Mac app (on a Mac: Apple's tools for disk images and signing only run
  on macOS). A release carries both.
- **Branches are for work in progress**, as for any feature: Mac support is being built on
  `mac-support`, and merged into `main` once it works.

## Where each feature stands

| Feature                                                  | Windows                                  | macOS                                                                                                         |
| -------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Her, her habits, walking, dragging, throwing, petting    | yes                                      | yes (shared code); she stands on the screen's work area, above the Dock                                       |
| The panel, chat, Apps, Jira, service desk, notifications | yes                                      | yes (shared code)                                                                                             |
| Spells, the screen saver, the familiar, her battle       | yes                                      | yes (shared code); the screen saver covers every Space                                                        |
| Kept on top of other windows, off the taskbar / Dock     | toolbar windows                          | on every Space and over full-screen apps; no Dock icon (`LSUIElement`)                                        |
| Start at login                                           | Start with Windows                       | Open at login (Electron's login item)                                                                         |
| Screenshots                                              | yes                                      | yes, once the user allows **Screen Recording** for Desktop Wizard (System Settings → Privacy & Security)      |
| Questions to Claude Desktop                              | filled in and sent                       | filled in (the `claude://` link); the user presses Return. Sending needs Accessibility permission: to do      |
| Taskbar tricks, peeking round windows, portals           | yes (UI Automation)                      | off for now: needs a Mac version of the shell probe (window list from `CGWindowListCopyWindowInfo`, the Dock) |
| Hide in full-screen apps                                 | yes                                      | off for now (same probe); she already stays over full-screen apps                                             |
| Check for updates                                        | yes (signed installer)                   | off for now: download new versions by hand; to do: install the zip, which needs the app signed                |
| Uninstall from Settings                                  | yes                                      | not offered: drag Desktop Wizard from Applications to the Bin                                                 |
| Signed so the OS trusts it                               | Ed25519 release key, no Authenticode yet | not yet: needs an Apple Developer ID and notarization, or macOS warns that it can't check the app             |

## How to build and try it on a Mac

1. On a Mac with Node 24: clone the repository, `npm install`, then `npm run dev` to run it, or
   `npm run dist:mac` to build `apps/desktop/dist/Desktop Wizard-<version>-mac.dmg` (and a `.zip`).
2. Unsigned, macOS won't open a downloaded copy straight away ("can't be opened because Apple
   cannot check it"). Right-click it in Applications and choose **Open**, once. Copies built on the
   same Mac open normally.
3. The first screenshot asks for **Screen Recording** permission; allow it in System Settings →
   Privacy & Security, and start Desktop Wizard again.

What to look at first, which couldn't be checked from Windows:

- She stands on the bottom of the screen, above the Dock, and stays on top: over other apps, on
  every desktop (Space), and over a full-screen app.
- Clicking her opens the panel, and typing in it works (no Dock icon can change how the focus
  moves on a Mac).
- Dragging and throwing her, between two screens too.
- The menu-bar icon (the tray): the company's icon in colour for now; Mac menu-bar icons are
  usually a single-colour "template" image.
- The screen saver over every screen, and waking it.

## Still to do

In order:

1. **Try it on a Mac** and fix what the list above turns up.
2. **Build it automatically**: a GitHub Actions job on a macOS runner can run `npm run dist:mac` for
   each release, so no Mac is needed to make one (free for public repositories).
3. **Sign and notarize it** with an Apple Developer ID (Apple Developer Program, about US$99 a year),
   so macOS opens it without warnings. electron-builder does both when given the certificate and
   an app-specific password in environment variables.
4. **Updates on a Mac**: the release carries the signed `.zip`; Check for updates downloads it,
   checks it against the release key as on Windows, and replaces the app. `npm run release` attaches
   the Mac files alongside the Windows ones.
5. **The shell probe on a Mac**, for her tricks and peeks: the windows on the screen and which is in
   front (`CGWindowListCopyWindowInfo`, through a small Swift helper or `osascript`), and the Dock's
   icons for the taskbar tricks (the Accessibility API, which needs the user's permission).
6. **Sending in Claude Desktop** on a Mac: pressing Return for the user through System Events, with
   the user's Accessibility permission.
