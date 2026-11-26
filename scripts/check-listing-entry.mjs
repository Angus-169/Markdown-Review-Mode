/**
 * Check a plugin-listing entry against the listing's own rules.
 *
 * The rules are the listing's, not ours: the entry must use the file name the
 * listing's slug produces, carry only the fields it reads, name the repository
 * its URL points at, and carry a GitHub-hosted raster icon when it has one.
 *
 * Run with `node scripts/check-listing-entry.mjs [path-to-yml]`.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { basename, dirname } from 'node:path'
import { parse as parseYaml } from 'yaml'

const CAT_IDS = ['agi', 'ui', 'usage', 'theme', 'model', 'identity', 'session', 'memory', 'tools', 'wsl', 'browser', 'vision', 'voice', 'docs', 'skill', 'workflow', 'git', 'notify', 'dev', 'security', 'remote', 'market', 'fun']
const LOCALE_CODES = ['en', 'zh']
const BASE_LOCALE = 'en'
const ENTRY_KEYS = new Set(['url', 'name', 'category', 'description', 'icon', 'tarball', 'file'])
const ICON_HOSTS = new Set(['raw.githubusercontent.com', 'user-images.githubusercontent.com', 'camo.githubusercontent.com', 'github.com'])
const ICON_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp']
const TARBALL_HOSTS = new Set(['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com'])

/**
 * The file name the listing derives from a URL.
 * @param {string} url - the entry's URL.
 * @returns {string} the expected file stem.
 */
function slugFor(url) {
  const p = url.replace(/^https:\/\/github\.com\//, '').replace(/\/+$/, '')
  const repo = p.split('/').slice(0, 2).join('/')
  const sub = p.includes('/tree/') ? p.split('/tree/')[1].replace(/^[^/]+\//, '') : null
  const base = repo.replaceAll('/', '__')
  return sub ? `${base}--${sub.replaceAll('/', '-')}` : base
}

/**
 * The listing's rule for an icon URL.
 * @param {string} value - the URL.
 * @returns {string|null} the problem, or null when it is usable.
 */
function iconProblem(value) {
  if (typeof value !== 'string' || !value.trim()) return 'must be a URL string'
  let u
  try {
    u = new URL(value)
  } catch {
    return `is not a valid URL: ${value}`
  }
  if (u.protocol !== 'https:') return 'must be https'
  if (!ICON_HOSTS.has(u.hostname)) return `must be hosted on GitHub (got ${u.hostname})`
  if (!ICON_EXTENSIONS.some((ext) => u.pathname.toLowerCase().endsWith(ext))) {
    return `must point at a raster image (${ICON_EXTENSIONS.join(', ')})`
  }
  return null
}

/**
 * The listing's rule for a tarball URL.
 * @param {string} value - the URL.
 * @returns {string|null} the problem, or null when it is usable.
 */
function tarballProblem(value) {
  if (typeof value !== 'string' || !value.trim()) return 'must be a URL string'
  let u
  try {
    u = new URL(value)
  } catch {
    return `is not a valid URL: ${value}`
  }
  if (u.protocol !== 'https:') return 'must be https'
  if (!TARBALL_HOSTS.has(u.hostname)) return `must be hosted on GitHub releases (got ${u.hostname})`
  if (u.hostname === 'github.com' && !u.pathname.includes('/releases/')) return 'must point at a GitHub release asset'
  if (!u.pathname.endsWith('.tgz') && !u.pathname.endsWith('.tar.gz')) return 'must point at a .tgz'
  return null
}

const entryPath = process.argv[2] ?? fileURLToPath(new URL('../listing/Angus-169__Markdown-Review-Mode.yml', import.meta.url))
const file = basename(entryPath)
const text = readFileSync(entryPath, 'utf8')
const entry = parseYaml(text)
const problems = []

const extra = Object.keys(entry).filter((key) => !ENTRY_KEYS.has(key))
if (extra.length) {
  problems.push(`unknown field${extra.length > 1 ? 's' : ''} ${extra.map((k) => `"${k}"`).join(', ')}`)
}
if (typeof entry.url !== 'string' || !/^https:\/\/github\.com\/[^/]+\/[^/]+/.test(entry.url)) {
  problems.push('"url" must be a https://github.com/owner/repo link')
} else {
  const want = slugFor(entry.url)
  if (file.slice(0, -'.yml'.length) !== want) problems.push(`filename must match the url — expected ${want}.yml (got ${file})`)
}
if (typeof entry.name !== 'string' || !entry.name.trim()) {
  problems.push('"name" is required')
} else if (entry.name.split('#')[0].includes('/')) {
  const named = entry.name.split('#')[0].trim().toLowerCase()
  const actual = String(entry.url).replace(/^https:\/\/github\.com\//, '').split('/').slice(0, 2).join('/').toLowerCase()
  if (named !== actual) problems.push(`"name" says ${entry.name} but the url is ${actual}`)
}
if (!CAT_IDS.includes(entry.category)) {
  problems.push(`"category" must be one of ${CAT_IDS.join(', ')} (got ${JSON.stringify(entry.category)})`)
}
for (const loc of LOCALE_CODES) {
  const value = entry.description?.[loc]
  if (value === undefined && loc !== BASE_LOCALE) continue
  if (typeof value !== 'string' || !value.trim()) {
    problems.push(loc === BASE_LOCALE ? `"description.${BASE_LOCALE}" is required` : `"description.${loc}" is present but empty — omit the key instead`)
  } else if (value.includes('\n')) {
    problems.push(`"description.${loc}" must be a single line`)
  } else if (value.includes(': ')) {
    problems.push(`"description.${loc}" contains ": " and must be quoted`)
  }
}
if (entry.description && typeof entry.description === 'object') {
  const extraLocales = Object.keys(entry.description).filter((k) => !LOCALE_CODES.includes(k))
  if (extraLocales.length) problems.push(`"description" has ${extraLocales.join(', ')}, but the site renders only ${LOCALE_CODES.join(' and ')}`)
}
if (entry.icon !== undefined) {
  const bad = iconProblem(entry.icon)
  if (bad) problems.push(`"icon" ${bad}`)
}
if (entry.tarball !== undefined) {
  const bad = tarballProblem(entry.tarball)
  if (bad) problems.push(`"tarball" ${bad}`)
}

console.log(`entry: ${entryPath}`)
console.log(`  file    : ${file}`)
console.log(`  url     : ${entry.url}`)
console.log(`  name    : ${entry.name}`)
console.log(`  category: ${entry.category}`)
console.log(`  icon    : ${entry.icon ?? '(none — falls back to the owner avatar)'}`)
if (problems.length === 0) {
  console.log('\n✓ the entry satisfies the listing\'s rules')
} else {
  console.log('\n✗ problems:')
  for (const problem of problems) console.log(`  - ${problem}`)
  process.exitCode = 1
}
void dirname
