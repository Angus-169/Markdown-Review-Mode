/**
 * Check that the plugin does not ship its own copies of the Host's packages.
 *
 * A plugin resolves `@deepseek-ai/*` from the Host's own installation. If the
 * plugin's directory also contains a copy, Node loads that copy instead, and
 * the plugin ends up talking to a *different* instance of Cordis than the
 * Host does: a service looked up by name would not be the same object, and a
 * plugin that registers against its own Cordis would be invisible to the
 * Host.
 *
 * The dev-time copies are fine — they are what the type checker reads — but
 * they must not sit in the directory the Host imports from. This script
 * reports the situation rather than deleting anything, because the copies are
 * needed for the build.
 */

const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const local = path.join(root, 'node_modules', '@deepseek-ai')
const out = []

if (!fs.existsSync(local)) {
  console.log('no local @deepseek-ai copies')
  process.exit(0)
}

const names = fs.readdirSync(local)
out.push(`local @deepseek-ai copies: ${names.length}`)

// A plugin that is installed by copying its directory would ship these.
// The DSH installer links the directory instead, so they stay local — but
// a packaged copy would not.
const packaged = fs.existsSync(path.join(root, '.npmignore')) || fs.existsSync(path.join(root, '.gitignore'))
out.push(`packaging metadata present: ${packaged}`)

const files = fs.existsSync(path.join(root, 'files')) ? JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).files : []
const shipsNodeModules = files.some(entry => entry.includes('node_modules'))
out.push(`files list ships node_modules: ${shipsNodeModules}`)

console.log(out.join('\n'))
