import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { appBundleOf, INSTALL_SCRIPT, installMacUpdate } from '../src/main/macUpdate'
import { uninstallMac } from '../src/main/uninstall'
import { MAC_UPDATE, newestRelease, releaseOf, saveDownload } from '../src/main/updates'

// Desktop Wizard on a Mac: finding its update in a release, installing it, and uninstalling.
// (The install script itself is run against stand-ins in development: see docs/MAC.md.)

const DOWNLOADS = 'https://github.com/Camby10101/Desktop-Wizard/releases/download/'
const asset = (name: string, size = 100) => ({
  name,
  browser_download_url: `${DOWNLOADS}2.8.0/${name}`,
  size,
  digest: `sha256:${'a'.repeat(64)}`,
})
/** A release with both OS's files, as GitHub lists it once the Mac build is attached and signed. */
const both = {
  tag_name: '2.8.0',
  draft: false,
  prerelease: false,
  assets: [
    asset('Desktop.Wizard-Setup-2.8.0.exe'),
    asset('Desktop.Wizard-Setup-2.8.0.exe.sig'),
    asset('Desktop.Wizard-2.8.0-mac.dmg'),
    asset('Desktop.Wizard-2.8.0-mac.zip', 200),
    asset('Desktop.Wizard-2.8.0-mac.zip.sig'),
  ],
}

describe('a Mac’s update', () => {
  it('is the release’s Mac zip, with its signature, never the Windows installer or the disk image', () => {
    const mac = releaseOf(both, DOWNLOADS, MAC_UPDATE)!
    expect(mac.installer.name).toBe('Desktop.Wizard-2.8.0-mac.zip')
    expect(mac.installer.size).toBe(200)
    expect(mac.signature).toBe(`${DOWNLOADS}2.8.0/Desktop.Wizard-2.8.0-mac.zip.sig`)
    // And Windows still takes its installer from the same release.
    expect(releaseOf(both, DOWNLOADS)!.installer.name).toBe('Desktop.Wizard-Setup-2.8.0.exe')
  })

  it('is “not attached yet” while the release has only the Windows installer', () => {
    const windowsOnly = { ...both, assets: both.assets.slice(0, 2) }
    expect(releaseOf(windowsOnly, DOWNLOADS, MAC_UPDATE)).toBeNull()
    expect(newestRelease([windowsOnly], DOWNLOADS, MAC_UPDATE)).toEqual({
      release: null,
      unfinished: '2.8.0',
    })
  })

  describe('downloaded', () => {
    let dir: string
    afterEach(() => rmSync(dir, { recursive: true, force: true }))

    it('is kept only if it’s a zip', async () => {
      dir = mkdtempSync(join(tmpdir(), 'mac-update-'))
      const chunks = async function* () {
        yield Buffer.from('zip')
      }
      const path = await saveDownload(dir, 'Desktop.Wizard-2.8.0-mac.zip', chunks(), /\.zip$/i)
      expect(path.endsWith('Desktop.Wizard-2.8.0-mac.zip')).toBe(true)
      await expect(saveDownload(dir, 'something.exe', chunks(), /\.zip$/i)).rejects.toThrow(
        /isn't an installer/,
      )
    })
  })
})

describe('the app a Mac copy runs from', () => {
  it('is the .app round the running program', () => {
    expect(appBundleOf('/Applications/Desktop Wizard.app/Contents/MacOS/Desktop Wizard')).toBe(
      '/Applications/Desktop Wizard.app',
    )
    expect(
      appBundleOf('/Users/sam/Applications/Desktop Wizard.app/Contents/MacOS/Desktop Wizard'),
    ).toBe('/Users/sam/Applications/Desktop Wizard.app')
  })

  it('isn’t one it can replace when run from the disk image, where it was downloaded, or not as an app', () => {
    expect(
      appBundleOf('/Volumes/Desktop Wizard 2.8.0/Desktop Wizard.app/Contents/MacOS/Desktop Wizard'),
    ).toBeNull()
    expect(
      appBundleOf(
        '/private/var/folders/x/AppTranslocation/1234/d/Desktop Wizard.app/Contents/MacOS/Desktop Wizard',
      ),
    ).toBeNull()
    expect(appBundleOf('/usr/local/bin/electron')).toBeNull()
    expect(appBundleOf('C:\\Program Files\\Desktop Wizard\\Desktop Wizard.exe')).toBeNull()
  })
})

describe('installing a Mac update', () => {
  const deps = (bundle: string | null, writable = true) => ({
    bundle,
    pid: 4242,
    staging: '/tmp/Desktop Wizard update',
    writable: () => writable,
    runDetached: vi.fn(),
  })

  it('starts the script on its own, the paths as arguments, never written into it', () => {
    const d = deps('/Applications/Desktop Wizard.app')
    installMacUpdate('/tmp/x/Desktop.Wizard-2.8.0-mac.zip', d)
    expect(d.runDetached).toHaveBeenCalledWith('/bin/sh', [
      '-c',
      INSTALL_SCRIPT,
      'desktop-wizard-update',
      '/tmp/x/Desktop.Wizard-2.8.0-mac.zip',
      '/Applications/Desktop Wizard.app',
      '/tmp/Desktop Wizard update',
      '4242',
    ])
    expect(INSTALL_SCRIPT).not.toContain('Desktop Wizard')
    // It waits for the app to quit before touching it, and puts the old one back if it must.
    expect(INSTALL_SCRIPT.indexOf('kill -0')).toBeLessThan(INSTALL_SCRIPT.indexOf('mv "$app"'))
    expect(INSTALL_SCRIPT).toContain('else mv "$staging/previous.app" "$app"')
  })

  it('changes nothing, and says why, where it can’t replace the app', () => {
    const notInApplications = deps(null)
    expect(() => installMacUpdate('/tmp/u.zip', notInApplications)).toThrow(
      /move it to Applications/,
    )
    const locked = deps('/Applications/Desktop Wizard.app', false)
    expect(() => installMacUpdate('/tmp/u.zip', locked)).toThrow(/can't change \/Applications/)
    expect(notInApplications.runDetached).not.toHaveBeenCalled()
    expect(locked.runDetached).not.toHaveBeenCalled()
  })
})

describe('uninstalling on a Mac', () => {
  const deps = (over: Partial<Parameters<typeof uninstallMac>[0]> = {}) => ({
    isPackaged: true,
    bundle: '/Applications/Desktop Wizard.app',
    stopStartingAtLogin: vi.fn(),
    trash: vi.fn(async () => {}),
    quit: vi.fn(),
    ...over,
  })

  it('moves the app to the Bin, stops it opening at login, and quits', async () => {
    const d = deps()
    expect(await uninstallMac(d)).toEqual({ ok: true })
    expect(d.trash).toHaveBeenCalledWith('/Applications/Desktop Wizard.app')
    expect(d.stopStartingAtLogin).toHaveBeenCalled()
    expect(d.quit).toHaveBeenCalled()
  })

  it('doesn’t from a development run, an app it can’t find, or when the Bin refuses', async () => {
    expect(await uninstallMac(deps({ isPackaged: false }))).toEqual({
      ok: false,
      reason: 'not-installed',
    })
    expect(await uninstallMac(deps({ bundle: null }))).toEqual({ ok: false, reason: 'missing' })
    const refused = deps({
      trash: vi.fn(async () => {
        throw new Error('no')
      }),
    })
    expect(await uninstallMac(refused)).toEqual({ ok: false, reason: 'failed' })
    expect(refused.quit).not.toHaveBeenCalled()
  })
})
