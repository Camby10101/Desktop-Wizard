import type { Rect } from '@shared/geometry'
import type { Foreground, PhysicalRect } from './shell/probe'

// Settings → Hide in full-screen apps: while a presentation, a video or a game fills the screen
// she's on, she steps out of the way, and comes back once it's gone. Windows says which window is
// in front (the shell probe's `foreground`), asked every couple of seconds.

/** How often she checks for a full-screen app in front (ms). */
export const FULL_SCREEN_CHECK_MS = 2000

/**
 * Windows' SHQueryUserNotificationState answers: nobody's there (locked, or the screen saver's on),
 * a full-screen Direct3D game, presentation mode.
 */
const NOT_PRESENT = 1
const D3D_FULL_SCREEN = 3
const PRESENTATION_MODE = 4

/**
 * Windows' own windows that fill their screen without being an app: the desktop, the taskbars, and
 * the shell's overlays (the Start menu, Search, the notification centre and the lock screen are
 * CoreWindows; the task switcher and Task View have their own).
 */
const SHELL = new Set([
  'Progman',
  'WorkerW',
  'Shell_TrayWnd',
  'Shell_SecondaryTrayWnd',
  'Windows.UI.Core.CoreWindow',
  'XamlExplorerHostIslandWindow',
  'MultitaskingViewFrame',
  'TaskSwitcherWnd',
  'ForegroundStaging',
  'LockScreenBackstopFrame',
])

/**
 * Whether a full-screen app is in front on the screen her window (`her`, DIPs) is on: the window
 * in front covers its whole monitor (taskbar and all) without a title bar, as full-screen
 * presentations, videos and games do (a maximised window has one, and stops at the taskbar), or
 * Windows says a game or presentation has the screen. Not the desktop, the taskbar, the Start menu
 * and the shell's other overlays, her own windows, or while nobody's there (locked).
 */
export function fullScreenOver(
  front: Foreground,
  her: Rect,
  ownPid: number,
  toDip: (rect: PhysicalRect) => Rect,
): boolean {
  const window = front.window
  if (!window || front.state === NOT_PRESENT) return false
  if (window.pid === ownPid || SHELL.has(window.className)) return false
  const { rect: r, monitor: m } = window
  const fills =
    !window.captioned &&
    r.x <= m.x &&
    r.y <= m.y &&
    r.x + r.width >= m.x + m.width &&
    r.y + r.height >= m.y + m.height
  if (!fills && front.state !== D3D_FULL_SCREEN && front.state !== PRESENTATION_MODE) return false
  const screen = toDip(m)
  const x = her.x + her.width / 2
  const y = her.y + her.height / 2
  return (
    x >= screen.x && x < screen.x + screen.width && y >= screen.y && y < screen.y + screen.height
  )
}

export interface FullScreenWatchDeps {
  /** The window in front now (the shell probe's `foreground`). */
  foreground(): Promise<Foreground>
  /** Where her window is (DIPs). */
  her(): Rect
  ownPid: number
  toDip(rect: PhysicalRect): Rect
  /** Told after every check whether a full-screen app is in front on her screen. */
  onCheck(fullScreen: boolean): void
  everyMs?: number
}

/**
 * Checks every FULL_SCREEN_CHECK_MS, while it's on, whether a full-screen app is in front on her
 * screen, and says so (BubbleController.fullScreen) each time: she may have been busy last time
 * (carried, or the panel open) and is to step aside now.
 */
export class FullScreenWatch {
  private timer: ReturnType<typeof setTimeout> | null = null
  private on = false

  constructor(private readonly deps: FullScreenWatchDeps) {}

  /** Starts or stops checking (Settings → Hide in full-screen apps); stopped, she comes back. */
  set(on: boolean): void {
    if (on === this.on) return
    this.on = on
    if (on) {
      this.schedule(0)
    } else {
      this.cancel()
      this.deps.onCheck(false)
    }
  }

  /** Stops checking for good (the app is quitting). */
  dispose(): void {
    this.on = false
    this.cancel()
  }

  private schedule(ms: number): void {
    this.timer = setTimeout(() => void this.check(), ms)
  }

  private cancel(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  private async check(): Promise<void> {
    this.timer = null
    try {
      const front = await this.deps.foreground()
      if (!this.on) return
      this.deps.onCheck(fullScreenOver(front, this.deps.her(), this.deps.ownPid, this.deps.toDip))
    } catch {
      // The shell didn't answer: nothing changes, and it's asked again next time.
    }
    if (this.on && !this.timer) this.schedule(this.deps.everyMs ?? FULL_SCREEN_CHECK_MS)
  }
}
