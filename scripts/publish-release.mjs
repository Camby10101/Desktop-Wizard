// Publishes the release on GitHub in one go (`npm run release`), once `npm run dist` has built and
// signed the installer and the version is merged and pushed to main (see docs/RELEASING.md):
// checks the installer's signature is the release key's for this version, creates the GitHub
// release tagged with the version (2.7.0, no v) on main (or uses the one there), attaches the installer and its
// signature (replacing a wrong one), and checks the release is there as copies look for it.
//
//   npm run release                          publish (needs GITHUB_TOKEN; see below)
//   npm run release -- --dry-run             check everything here and say what it would do
//   npm run release -- --notes "What's new"  the release's notes (else GitHub writes them from
//                                            the commits since the last release)
//
// It needs a GitHub token allowed to publish releases on the repository, in the GITHUB_TOKEN (or
// GH_TOKEN) environment variable for the one PowerShell window it's run from. The token is only
// sent to GitHub: never printed, never saved.

import { execFileSync } from 'node:child_process'
import { createHash, createPublicKey, verify } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { signedText } from './release-signing.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const API = 'https://api.github.com'
const UPLOADS = 'https://uploads.github.com'

/**
 * What's to be released, from the files here: the version (apps/desktop/package.json), its tag,
 * the repository copies update from and the release key's public half (the tenant's tenant.json),
 * and the installer and its signature (installer/, where `npm run dist` puts them).
 */
export function releasePlan(root = ROOT, tenantName = process.env.TENANT ?? 'morse-micro') {
  const app = JSON.parse(readFileSync(join(root, 'apps', 'desktop', 'package.json'), 'utf8'))
  const tenant = JSON.parse(readFileSync(join(root, 'tenants', tenantName, 'tenant.json'), 'utf8'))
  if (!tenant.updates?.repo) {
    throw new Error(`${tenantName} doesn't update from GitHub (no updates.repo in tenant.json).`)
  }
  const installer = join(root, 'installer', `${app.productName}-Setup-${app.version}.exe`)
  const files = [installer, `${installer}.sig`]
  for (const file of files) {
    if (!existsSync(file)) {
      throw new Error(`${file} isn't there: run npm run dist first (with the release key).`)
    }
  }
  return {
    version: app.version,
    // The version itself, no `v` in front (copies take either, but releases are tagged without).
    tag: app.version,
    repo: tenant.updates.repo,
    publicKey: tenant.updates.publicKey,
    files: files.map((path) => ({ path, name: basename(path), size: statSync(path).size })),
  }
}

/** Whether `signature` (the .sig file's base64) is the release key's for this version and installer. */
export function signatureHolds(version, installer, signature, publicKeyBase64) {
  const sha256 = createHash('sha256').update(installer).digest('hex')
  const key = createPublicKey({
    key: Buffer.from(publicKeyBase64, 'base64'),
    format: 'der',
    type: 'spki',
  })
  try {
    return verify(
      null,
      Buffer.from(signedText(version, sha256)),
      key,
      Buffer.from(signature.trim(), 'base64'),
    )
  } catch {
    return false
  }
}

/** The name GitHub gives an attached file: spaces become dots. */
export const assetName = (name) => name.replace(/ /g, '.')

/**
 * Publishes the release: the GitHub release for `plan.tag` (made on main if it isn't there, and
 * made a published, latest release if it was a draft or pre-release), with both files attached
 * (one already there the same size is left; a wrong one is replaced). Checks it at the end, and
 * returns its page. `fetch` is the global fetch, or a stand-in in the tests.
 */
export async function publish({
  plan,
  token,
  notes,
  fetch = globalThis.fetch,
  readFile = readFileSync,
  log = console.log,
}) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'desktop-wizard-release',
  }
  const call = async (method, url, body, extra = {}) => {
    const response = await fetch(url, {
      method,
      headers: { ...headers, ...extra },
      ...(body === undefined ? {} : { body: Buffer.isBuffer(body) ? body : JSON.stringify(body) }),
    })
    if (response.status === 404 && method === 'GET') return null
    if (!response.ok) {
      let detail = ''
      try {
        detail = (await response.json()).message ?? ''
      } catch {
        // No JSON: the status says enough.
      }
      throw new Error(
        `GitHub said ${response.status} to ${method} ${url.split('?')[0]}${detail ? `: ${detail}` : ''}`,
      )
    }
    return response.status === 204 ? null : response.json()
  }
  const releaseUrl = `${API}/repos/${plan.repo}/releases`

  let release = await call('GET', `${releaseUrl}/tags/${plan.tag}`)
  if (!release) {
    log(`Creating the release ${plan.tag} on main…`)
    release = await call('POST', releaseUrl, {
      tag_name: plan.tag,
      target_commitish: 'main',
      name: `Desktop Wizard ${plan.version}`,
      ...(notes ? { body: notes } : { generate_release_notes: true }),
      draft: false,
      prerelease: false,
      make_latest: 'true',
    })
  } else if (release.draft || release.prerelease) {
    log(`The release ${plan.tag} is there as a draft or pre-release: publishing it…`)
    release = await call('PATCH', `${releaseUrl}/${release.id}`, {
      draft: false,
      prerelease: false,
      make_latest: 'true',
    })
  } else {
    log(`The release ${plan.tag} is there already.`)
  }

  for (const file of plan.files) {
    const name = assetName(file.name)
    const there = (release.assets ?? []).find((asset) => asset.name === name)
    if (there && there.size === file.size) {
      log(`${name} is attached already.`)
      continue
    }
    if (there) {
      log(`${name} is attached but isn't this build's: replacing it…`)
      await call('DELETE', `${releaseUrl}/assets/${there.id}`)
    }
    log(`Attaching ${name} (${(file.size / 1024 / 1024).toFixed(1)} MB)…`)
    await call(
      'POST',
      `${UPLOADS}/repos/${plan.repo}/releases/${release.id}/assets?name=${encodeURIComponent(file.name)}`,
      readFile(file.path),
      { 'Content-Type': 'application/octet-stream' },
    )
  }

  // As copies see it: published, not a pre-release, both files there in full.
  const done = await call('GET', `${releaseUrl}/tags/${plan.tag}`)
  const missing = plan.files.filter(
    (file) =>
      !(done?.assets ?? []).some((a) => a.name === assetName(file.name) && a.size === file.size),
  )
  if (!done || done.draft || done.prerelease || missing.length > 0) {
    throw new Error(
      `The release isn't right yet${missing.length ? `: ${missing.map((f) => f.name).join(' and ')} missing` : ''}. Run npm run release again.`,
    )
  }
  return done.html_url
}

/** Whether this is main, with nothing uncommitted, and the same as main on GitHub. */
function onPushedMain(git) {
  git(['fetch', '--quiet', 'origin', 'main'])
  const problems = []
  if (git(['rev-parse', '--abbrev-ref', 'HEAD']) !== 'main') problems.push("this isn't main")
  if (git(['status', '--porcelain']) !== '') problems.push('there are changes not committed')
  if (git(['rev-parse', 'HEAD']) !== git(['rev-parse', 'origin/main'])) {
    problems.push("main here isn't the same as main on GitHub (push or pull first)")
  }
  return problems
}

async function main(args) {
  const dryRun = args.includes('--dry-run')
  const notesAt = args.indexOf('--notes')
  const notes = notesAt >= 0 ? args[notesAt + 1] : undefined

  const plan = releasePlan()
  const [installer, signature] = plan.files
  if (
    !signatureHolds(
      plan.version,
      readFileSync(installer.path),
      readFileSync(signature.path, 'utf8'),
      plan.publicKey,
    )
  ) {
    throw new Error(
      `${signature.name} isn't the release key's signature of ${installer.name}: build and sign again with npm run dist.`,
    )
  }
  console.log(`${installer.name} is signed with the release key for ${plan.version}.`)

  const git = (gitArgs) => execFileSync('git', gitArgs, { cwd: ROOT, encoding: 'utf8' }).trim()
  const problems = onPushedMain(git)
  if (problems.length > 0) {
    throw new Error(
      `Not releasing: ${problems.join('; ')}. The release is tagged on main as it is on GitHub.`,
    )
  }

  if (dryRun) {
    console.log(
      `Would publish ${plan.tag} on ${plan.repo} (main), attaching ${plan.files.map((f) => assetName(f.name)).join(' and ')}.`,
    )
    return
  }
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
  if (!token) {
    throw new Error(
      [
        "There's no GitHub token. Make one at https://github.com/settings/personal-access-tokens/new:",
        `  a fine-grained token, for only ${plan.repo}, with Contents: Read and write.`,
        "Then, in this PowerShell window only (it isn't saved anywhere):",
        "  $env:GITHUB_TOKEN = '<the token>'",
        'and run npm run release again.',
      ].join('\n'),
    )
  }
  const url = await publish({ plan, token, notes })
  console.log(`Published: ${url}`)
  console.log('Settings → Check for updates on older copies will find it.')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
