import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

// scripts/publish-release.mjs (`npm run release`), against a stand-in for GitHub's release API.

interface Plan {
  version: string
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
  tag: 'v2.7.0',
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
function fakeGitHub(release?: Partial<FakeRelease>) {
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
  const json = (status: number, body: unknown) =>
    new Response(body === null ? null : JSON.stringify(body), { status })
  const fetch = (async (url: string, init: RequestInit) => {
    const method = init.method ?? 'GET'
    const headers = init.headers as Record<string, string>
    requests.push({ method, url, headers, body: init.body })
    if (method === 'GET' && url.endsWith('/releases/tags/v2.7.0')) {
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
      current!.assets = [...current!.assets, asset]
      return json(201, asset)
    }
    return json(500, { message: 'unexpected' })
  }) as unknown as typeof globalThis.fetch
  return {
    fetch,
    requests,
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
      tag_name: 'v2.7.0',
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
    mkdirSync(join(root, 'installer'))
    writeFileSync(join(root, 'installer', 'Desktop Wizard-Setup-2.7.0.exe'), '12345')
    writeFileSync(join(root, 'installer', 'Desktop Wizard-Setup-2.7.0.exe.sig'), 'sig')
    const plan = script.releasePlan(root, 't')
    expect(plan).toMatchObject({
      version: '2.7.0',
      tag: 'v2.7.0',
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
