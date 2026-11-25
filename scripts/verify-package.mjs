/**
 * Check the packaged output.
 *
 * The package is installed as a directory, so this verifies what the bundle
 * will actually ship: the manifest's exports must resolve, the files the
 * manifest lists must exist, and the client bundle must be a well-formed
 * factory registration rather than a bare module.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const problems = []

/**
 * Report a problem.
 * @param {string} message - what is wrong.
 */
function fail(message) {
  problems.push(message)
}

/**
 * The newest modification time under a directory tree.
 * @param {string} dir - the directory to scan.
 * @param {string[]} skip - directory names to ignore.
 * @returns {number} the newest mtime in milliseconds, or 0.
 */
function newestMtime(dir, skip = []) {
  let newest = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (skip.includes(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      newest = Math.max(newest, newestMtime(full, skip))
      continue
    }
    newest = Math.max(newest, statSync(full).mtimeMs)
  }
  return newest
}

/**
 * Whether a path exists and is a file.
 * @param {string} path - the path to check.
 * @returns {boolean} true when the path is a file.
 */
function isFile(path) {
  return existsSync(path) && statSync(path).isFile()
}

/**
 * Whether a manifest path pattern matches anything on disk.
 * @param {string} pattern - the manifest's path pattern.
 * @returns {boolean} true when at least one file matches.
 */
function patternMatches(pattern) {
  if (!pattern.includes('*')) return isFile(join(root, pattern))
  const directory = pattern.slice(0, pattern.lastIndexOf('/'))
  const file = pattern.slice(pattern.lastIndexOf('/') + 1)
  const prefix = file.split('*')[0]
  const suffix = file.split('*').pop() ?? ''
  const directoryPath = join(root, directory)
  if (!existsSync(directoryPath)) return false
  // A small, fixed scan: the manifest's own file list is the only thing that
  // needs to be checked, so a shallow read is enough.
  return readdirSync(directoryPath).some(name => name.startsWith(prefix) && name.endsWith(suffix))
}

const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

// The manifest's exports must resolve to files that exist.
for (const [subpath, target] of Object.entries(manifest.exports ?? {})) {
  const paths = typeof target === 'string' ? [target] : Object.values(target)
  for (const path of paths) {
    if (path.includes('*')) {
      if (!patternMatches(path)) fail(`export "${subpath}" matches no file: ${path}`)
      continue
    }
    if (!isFile(join(root, path))) {
      fail(`export "${subpath}" points at a missing file: ${path}`)
    }
  }
}

// The files list must cover the runtime files the bundle needs.
for (const entry of manifest.files ?? []) {
  if (entry.includes('*')) {
    if (!patternMatches(entry)) fail(`files entry matches no file: ${entry}`)
    continue
  }
  if (!existsSync(join(root, entry))) {
    fail(`files entry does not exist: ${entry}`)
  }
}

// The Host entry must export an apply function.
const hostEntry = join(root, 'lib', 'index.js')
if (!isFile(hostEntry)) {
  fail('the Host entry lib/index.js is missing')
} else {
  const source = readFileSync(hostEntry, 'utf8')
  if (!/export\s+(async\s+)?function\s+apply|export\s*\{[^}]*\bapply\b/.test(source)) {
    fail('the Host entry does not export an apply function')
  }
}

// The client bundle must register a factory rather than run on load.
const clientEntry = join(root, 'lib', 'client.js')
if (!isFile(clientEntry)) {
  fail('the client bundle lib/client.js is missing')
} else {
  const source = readFileSync(clientEntry, 'utf8')
  if (!source.includes('__ModuleLoader__')) {
    fail('the client bundle does not register through __ModuleLoader__')
  }
  if (!/exports\.apply|function apply/.test(source)) {
    fail('the client bundle does not export an apply function')
  }
}

// The locale files must carry the metadata the plugin manager reads.
for (const locale of ['en', 'zh']) {
  const path = join(root, 'locale', `${locale}.json`)
  if (!isFile(path)) {
    fail(`the ${locale} locale file is missing`)
    continue
  }
  const parsed = JSON.parse(readFileSync(path, 'utf8'))
  if (typeof parsed.meta?.title !== 'string' || parsed.meta.title.length === 0) {
    fail(`the ${locale} locale file carries no meta.title`)
  }
  if (typeof parsed.meta?.description !== 'string' || parsed.meta.description.length === 0) {
    fail(`the ${locale} locale file carries no meta.description`)
  }
}

// The client bundle must not be older than the sources it was built from.
// A stale bundle still loads and still exports `apply`, so only its age tells
// the truth — and a stale bundle silently serves yesterday's behaviour.
const clientBundle = join(root, 'lib', 'client.js')
if (isFile(clientBundle)) {
  const newestSource = newestMtime(join(root, 'src'), ['node_modules'])
  const bundleTime = statSync(clientBundle).mtimeMs
  if (bundleTime < newestSource) {
    fail(
      'the client bundle lib/client.js is older than the sources; run `npm run build` before packaging',
    )
  }
}

// The decoration classes the code uses must be defined by the bundled CSS.
// A name only one side knows about is a rule that silently does nothing, and
// the document then looks like the feature was never built.
const clientSource = readFileSync(clientEntry, 'utf8')
const cssLiteral = /const css = ("(?:[^"\\]|\\.)*")/.exec(clientSource)
if (cssLiteral === null) {
  fail('the bundled CSS literal could not be found')
} else {
  let css = ''
  try {
    css = JSON.parse(cssLiteral[1])
  } catch {
    fail('the bundled CSS literal could not be parsed')
  }
  // The class names the CSS defines, exactly — a substring test would let
  // `.cm-review-highlight` pass against a rule for
  // `.cm-review-highlight-typo`.
  const defined = new Set(css.match(/\.([A-Za-z_][A-Za-z0-9_-]*)/g)?.map(name => name.slice(1)) ?? [])
  const used = new Set(clientSource.match(/['"`](cm-review-[A-Za-z0-9_-]+)['"`]/g)?.map(name => name.slice(1, -1)) ?? [])
  for (const name of used) {
    if (!defined.has(name)) {
      fail(`the decoration class "${name}" is used by the bundle but not defined in its CSS`)
    }
  }
  // The Markdown language is what gives the preview its syntax tree.
  if (!clientSource.includes('markdownLanguage')) {
    fail('the client bundle carries no Markdown language; the live preview would have no syntax tree')
  }
}

// The icon must be a real SVG.
const icon = join(root, 'icon.svg')
if (!isFile(icon)) {
  fail('icon.svg is missing')
} else {
  const source = readFileSync(icon, 'utf8')
  if (!source.includes('<svg')) {
    fail('icon.svg is not an SVG')
  }
}

if (problems.length > 0) {
  console.error('package verification failed:')
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}

console.log('package verification passed')
