/**
 * Strip the author's local checkout path from the published bundle.
 *
 * tsdown emits `//#region \0<id>:<absolute-path>` comments for its virtual CSS
 * modules. They are harmless at runtime but leak a directory name, and a
 * repository should not publish where it was built.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const files = [join(root, 'lib', 'client.js'), join(root, 'lib', 'index.js')]

for (const file of files) {
  try {
    const source = readFileSync(file, 'utf8')
    const cleaned = source.replace(/\/\/#region [^\n]*[A-Za-z]:\\[^\n]*/g, '//#region (generated)')
    if (cleaned !== source) writeFileSync(file, cleaned, 'utf8')
  } catch {
    // Not every build emits every file; nothing to clean is fine.
  }
}

console.log('stripped local source paths from the bundle')
