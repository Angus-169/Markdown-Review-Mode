const fs = require('node:fs')
const path = require('node:path')

// The package's own sources, wherever the checkout happens to be. A hardcoded
// path here would only ever work on the machine it was written on.
const root = path.join(__dirname, '..', 'src')

function walk(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') || entry.name.endsWith('.css')) out.push(full)
  }
  return out
}

const repair = process.argv.includes('--repair')
const problems = []

for (const file of walk(root)) {
  const bytes = fs.readFileSync(file)
  let text = bytes.toString('utf8')
  const before = text

  // A NUL byte where a space belongs: the write path mangled a separator.
  text = text.replace(/\u0000/g, ' ')
  // A private-use codepoint where an o-umlaut belongs.
  text = text.replace(/[\uE000-\uF8FF]/g, 'ø')
  // A UTF-8 em dash read as GBK and written back: the shell round-trip
  // re-encoded the file, and the dash came out as mojibake.
  text = text.replace(/\u9225\?/g, '\u2014')

  if (text !== before) {
    if (repair) {
      fs.writeFileSync(file, text, 'utf8')
      problems.push(`REPAIRED ${path.relative(root, file)}`)
    } else {
      problems.push(`CORRUPT  ${path.relative(root, file)}`)
    }
    continue
  }

  // Any remaining control character other than tab/newline is a defect.
  for (let i = 0; i < text.length; i += 1) {
    const code = text.codePointAt(i)
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
      problems.push(`CONTROL  ${path.relative(root, file)} at ${i} U+${code.toString(16)}`)
      break
    }
    if (code >= 0xe000 && code <= 0xf8ff) {
      problems.push(`PUA      ${path.relative(root, file)} at ${i} U+${code.toString(16)}`)
      break
    }
  }
}

console.log(problems.length ? problems.join('\n') : 'clean')
process.exit(problems.some(p => p.startsWith('CORRUPT') || p.startsWith('CONTROL') || p.startsWith('PUA')) && !repair ? 1 : 0)