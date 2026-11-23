import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

// scripts/publish-release.mjs (`npm run release`), against a stand-in for GitHub's release API.

interface Plan {
  version: string
  productName: string
  tag: string
  repo: string
  publicKey: string
  files: { path: string; name: string; size: number }[]
}
interface Script {
  releasePlan(root: string, tenant: string): Plan
  signatureHolds(version: string, installer: Buffer, signature: string, key: string): boolean
  assetName(name: string): string
  publish(options: {
    plan: Plan
    token: string
    notes?: string
    fetch: typeof fetch
    readFile: (path: string) => Buffer
    log: (line: string) => void
    signMac?: (zip: Buffer) => string
  }): Promise<string>
}
let script: Script
beforeAll(async () => {
  script = (await import(
    pathToFileURL(resolve(__dirname, '../../../scripts/publish-release.mjs')).href
  )) as Script
})

const PLAN: Plan = {
  version: '2.7.0',
  productName: 'Desktop Wizard',
  tag: '2.7.0',
  repo: 'owner/repo',
  publicKey: 'unused here',
  files: [
    { path: 'a.exe', name: 'Desktop Wizard-Setup-2.7.0.exe', size: 5 },
    { path: 'a.exe.sig', name: 'Desktop Wizard-Setup-2.7.0.exe.sig', size: 3 },
  ],
}
const CONTENT: Record<string, Buffer> = {
  'a.exe': Buffer.from('12345'),
  'a.exe.sig': Buffer.from('sig'),
}

interface FakeAsset {
  id: number
  name: string
  size: number
}
interface FakeRelease {
  id: number
  html_url: string
  assets: FakeAsset[]
  [field: string]: unknown
}

/** GitHub's releases for one repository, kept in memory, and every request made. */
function fakeGitHub(release?: Partial<FakeRelease>, files: Record<number, Buffer> = {}) {
  const requests: {
    method: string
    url: string
    headers: Record<string, string>
    body?: unknown
  }[] = []
  let current: FakeRelease | null = release
    ? { id: 7, html_url: 'https://x/r', assets: [], ...release }
    : null
  let nextAsset = 100
  /** What each asset holds (by id): those given, and those uploaded. */
  const contents = new Map<number, Buffer>(Object.entries(files).map(([id, b]) => [Number(id), b]))
  const json = (status: number, body: unknown) =>
    new Response(body === null ? null : JSON.stringify(body), { status })
  const fetch = (async (url: string, init: RequestInit) => {
    const method = init.method ?? 'GET'
    const headers = init.headers as Record<string, string>
    requests.push({ method, url, headers, body: init.body })
    if (method === 'GET' && /\/releases\/assets\/\d+$/.test(url)) {
      const id = Number(url.split('/').pop())
      const bytes = contents.get(id)
      return bytes ? new Response(bytes, { status: 200 }) : json(404, { message: 'Not Found' })
    }
    if (method === 'GET' && url.endsWith('/releases/tags/2.7.0')) {
      return current ? json(200, current) : json(404, { message: 'Not Found' })
    }
    if (method === 'POST' && url.endsWith('/repos/owner/repo/releases')) {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>
      current = {
        id: 7,
        html_url: 'https://x/r',
        assets: [],
        draft: false,
        prerelease: false,
        ...body,
      }
      return json(201, current)
    }
    if (method === 'PATCH') {
      current = { ...current!, ...(JSON.parse(String(init.body)) as object) }
      return json(200, current)
    }
    if (method === 'DELETE') {
      const id = Number(url.split('/').pop())
      current!.assets = current!.assets.filter((a) => a.id !== id)
      return json(204, null)
    }
    if (method === 'POST' && url.startsWith('https://uploads.github.com/')) {
      const name = decodeURIComponent(new URL(url).searchParams.get('name')!).replace(/ /g, '.')
      const asset = { id: nextAsset++, name, size: (init.body as Buffer).length }
      contents.set(asset.id, init.body as Buffer)
      current!.assets = [...current!.assets, asset]
      return json(201, asset)
    }
    return json(500, { message: 'unexpected' })
  }) as unknown as typeof globalThis.fetch
  return {
    fetch,
    requests,
    contents,
    get release() {
      return current
    },
  }
}

const run = (github: ReturnType<typeof fakeGitHub>, notes?: string) =>
  script.publish({
    plan: PLAN,
    token: 'secret-token',
    notes,
    fetch: github.fetch,
    readFile: (path) => CONTENT[path]!,
    log: () => {},
  })

describe('npm run release', () => {
  it('creates the release on main, tagged with the version, and attaches both files', async () => {
    const github = fakeGitHub()
    expect(await run(github)).toBe('https://x/r')
    const create = github.requests.find((r) => r.method === 'POST' && r.url.includes('api.github'))!
    expect(JSON.parse(String(create.body))).toMatchObject({
      tag_name: '2.7.0',
      target_commitish: 'main',
      name: 'Desktop Wizard 2.7.0',
      draft: false,
      prerelease: false,
      generate_release_notes: true,
    })
    const uploads = github.requests.filter((r) => r.url.startsWith('https://uploads.github.com/'))
    expect(uploads.map((r) => new URL(r.url).searchParams.get('name'))).toEqual([
      'Desktop Wizard-Setup-2.7.0.exe',
      'Desktop Wizard-Setup-2.7.0.exe.sig',
    ])
    expect(uploads[0]!.headers['Content-Type']).toBe('application/octet-stream')
    expect(uploads[0]!.body).toEqual(CONTENT['a.exe'])
    // Every request carries the token, to GitHub only.
    for (const r of github.requests) {
      expect(r.headers['Authorization']).toBe('Bearer secret-token')
      expect(new URL(r.url).hostname).toMatch(/^(api|uploads)\.github\.com$/)
    }
  })

  it('uses the notes given, instead of GitHub’s', async () => {
    const github = fakeGitHub()
    await run(github, 'What’s new')
    const create = github.requests.find((r) => r.method === 'POST' && r.url.includes('api.github'))!
    const body = JSON.parse(String(create.body)) as Record<string, unknown>
    expect(body['body']).toBe('What’s new')
    expect(body['generate_release_notes']).toBeUndefined()
  })

  it('leaves files already attached, and replaces one that isn’t this build’s', async () => {
    const github = fakeGitHub({
      draft: false,
      prerelease: false,
      assets: [
        { id: 1, name: 'Desktop.Wizard-Setup-2.7.0.exe', size: 5 },
        { id: 2, name: 'Desktop.Wizard-Setup-2.7.0.exe.sig', size: 99 },
      ],
    })
    await run(github)
    expect(github.requests.filter((r) => r.method === 'POST')).toHaveLength(1) // just the .sig
    expect(github.requests.some((r) => r.method === 'DELETE' && r.url.endsWith('/assets/2'))).toBe(
      true,
    )
    expect(github.release!.assets).toEqual([
      { id: 1, name: 'Desktop.Wizard-Setup-2.7.0.exe', size: 5 },
      { id: 100, name: 'Desktop.Wizard-Setup-2.7.0.exe.sig', size: 3 },
    ])
  })

  it('publishes a release left as a draft or pre-release', async () => {
    const github = fakeGitHub({ draft: true, prerelease: false })
    await run(github)
    expect(github.release!['draft']).toBe(false)
    expect(github.release!['make_latest']).toBe('true')
  })

  it('stops with what GitHub said when it refuses, never showing the token', async () => {
    const refusing = (async () =>
      new Response(JSON.stringify({ message: 'Bad credentials' }), {
        status: 401,
      })) as unknown as typeof fetch
    const error = await script
      .publish({
        plan: PLAN,
        token: 'secret-token',
        fetch: refusing,
        readFile: (path) => CONTENT[path]!,
        log: () => {},
      })
      .catch((e: Error) => e)
    expect(String(error)).toContain('401')
    expect(String(error)).toContain('Bad credentials')
    expect(String(error)).not.toContain('secret-token')
  })

  it('names files as GitHub does: spaces become dots', () => {
    expect(script.assetName('Desktop Wizard-Setup-2.7.0.exe')).toBe(
      'Desktop.Wizard-Setup-2.7.0.exe',
    )
  })
})

describe('what it releases', () => {
  let root: string
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('the version, its tag, the repository, and the installer and signature from installer/', () => {
    root = mkdtempSync(join(tmpdir(), 'release-'))
    mkdirSync(join(root, 'apps', 'desktop'), { recursive: true })
    mkdirSync(join(root, 'tenants', 't'), { recursive: true })
    writeFileSync(
      join(root, 'apps', 'desktop', 'package.json'),
      JSON.stringify({ version: '2.7.0', productName: 'Desktop Wizard' }),
    )
    writeFileSync(
      join(root, 'tenants', 't', 'tenant.json'),
      JSON.stringify({ updates: { repo: 'owner/repo', publicKey: 'KEY' } }),
    )
    expect(() => script.releasePlan(root, 't')).toThrow(/npm run dist/)
    mkdirSync(join(root, 'installer', 'windows'), { recursive: true })
    writeFileSync(join(root, 'installer', 'windows', 'Desktop Wizard-Setup-2.7.0.exe'), '12345')
    writeFileSync(join(root, 'installer', 'windows', 'Desktop Wizard-Setup-2.7.0.exe.sig'), 'sig')
    const plan = script.releasePlan(root, 't')
    expect(plan).toMatchObject({
      version: '2.7.0',
      tag: '2.7.0',
      repo: 'owner/repo',
      publicKey: 'KEY',
    })
    expect(plan.files.map((f) => [f.name, f.size])).toEqual([
      ['Desktop Wizard-Setup-2.7.0.exe', 5],
      ['Desktop Wizard-Setup-2.7.0.exe.sig', 3],
    ])
  })

  it('only a signature the release key made for this version and this installer', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const key = publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
    const installer = Buffer.from('the installer')
    const sha256 = createHash('sha256').update(installer).digest('hex')
    const signature = sign(
      null,
      Buffer.from(`desktop-assist-update 2.7.0 sha256:${sha256}`),
      privateKey,
    ).toString('base64')
    expect(script.signatureHolds('2.7.0', installer, `${signature}\n`, key)).toBe(true)
    expect(script.signatureHolds('2.7.1', installer, signature, key)).toBe(false)
    expect(script.signatureHolds('2.7.0', Buffer.from('another'), signature, key)).toBe(false)
    expect(script.signatureHolds('2.7.0', installer, 'not a signature', key)).toBe(false)
  })
})

describe('the Mac build on the release', () => {
  // A real release key, so the Mac zip's signature can be made and checked.
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const plan = {
    ...PLAN,
    publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
  }
  const zip = Buffer.from('the Mac app, zipped')
  const sigOf = (file: Buffer) => {
    const sha256 = createHash('sha256').update(file).digest('hex')
    return sign(
      null,
      Buffer.from(`desktop-assist-update 2.7.0 sha256:${sha256}`),
      privateKey,
    ).toString('base64')
  }
  /** The release with the Windows files attached, and the Mac build (and a .sig) if given. */
  const published = (mac: { zip?: Buffer; sig?: string }) => {
    const assets = [
      { id: 1, name: 'Desktop.Wizard-Setup-2.7.0.exe', size: 5 },
      { id: 2, name: 'Desktop.Wizard-Setup-2.7.0.exe.sig', size: 3 },
    ]
    const files: Record<number, Buffer> = {}
    if (mac.zip) {
      assets.push({ id: 3, name: 'Desktop.Wizard-2.7.0-mac.zip', size: mac.zip.length })
      files[3] = mac.zip
    }
    if (mac.sig) {
      assets.push({ id: 4, name: 'Desktop.Wizard-2.7.0-mac.zip.sig', size: mac.sig.length })
      files[4] = Buffer.from(mac.sig)
    }
    return fakeGitHub({ draft: false, prerelease: false, assets }, files)
  }
  const release = (github: ReturnType<typeof fakeGitHub>, lines: string[] = []) => {
    const signMac = vi.fn((file: Buffer) => sigOf(file))
    return {
      signMac,
      done: script.publish({
        plan,
        token: 'secret-token',
        fetch: github.fetch,
        readFile: (path) => CONTENT[path]!,
        log: (line) => lines.push(line),
        signMac,
      }),
    }
  }

  it('isn’t there until GitHub Actions attaches it: it says to run again then', async () => {
    const lines: string[] = []
    const { signMac, done } = release(published({}), lines)
    await done
    expect(signMac).not.toHaveBeenCalled()
    expect(lines.join('\n')).toMatch(
      /Mac build isn't on the release yet.*run npm run release again/is,
    )
  })

  it('is signed with the release key, here, and its signature attached', async () => {
    const github = published({ zip })
    const { signMac, done } = release(github)
    await done
    expect(signMac).toHaveBeenCalledWith(zip)
    const upload = github.requests.find(
      (r) => r.method === 'POST' && r.url.startsWith('https://uploads.github.com/'),
    )!
    expect(new URL(upload.url).searchParams.get('name')).toBe('Desktop.Wizard-2.7.0-mac.zip.sig')
    expect(String(upload.body).trim()).toBe(sigOf(zip))
    // Downloading the zip asked GitHub for the file itself.
    const fetched = github.requests.find((r) => r.url.endsWith('/releases/assets/3'))!
    expect(fetched.headers['Accept']).toBe('application/octet-stream')
  })

  it('is left as it is when it’s signed already', async () => {
    const github = published({ zip, sig: `${sigOf(zip)}\n` })
    const { signMac, done } = release(github)
    await done
    expect(signMac).not.toHaveBeenCalled()
    expect(github.requests.some((r) => r.method === 'POST' || r.method === 'DELETE')).toBe(false)
  })

  it('is signed again when its signature is for another build (it was built again)', async () => {
    const github = published({ zip, sig: sigOf(Buffer.from('an earlier build')) })
    const { signMac, done } = release(github)
    await done
    expect(signMac).toHaveBeenCalledWith(zip)
    expect(github.requests.some((r) => r.method === 'DELETE' && r.url.endsWith('/assets/4'))).toBe(
      true,
    )
    const sig = github.release!.assets.find((a) => a.name === 'Desktop.Wizard-2.7.0-mac.zip.sig')!
    expect(String(github.contents.get(sig.id)).trim()).toBe(sigOf(zip))
  })
})
