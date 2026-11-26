import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const manifest = JSON.parse(readFileSync(`${root}package.json`, 'utf8'))
const license = readFileSync(`${root}LICENSE`, 'utf8')

const checks = []
const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const idOk = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug('Markdown-Review-Mode'))

checks.push(['LICENSE 文件存在', license.length > 0])
checks.push(['LICENSE 是 MIT 正文', license.includes('MIT License') && license.includes('WITHOUT WARRANTY OF ANY KIND')])
checks.push(['package.json 的 license 是 SPDX 标识符', /^[A-Za-z0-9.+-]+$/.test(manifest.license ?? '')])
checks.push(['LICENSE 声明与 package.json 一致', (manifest.license ?? '').toUpperCase() === 'MIT'])
checks.push(['插件 id slug 合法', idOk])
checks.push(['声明了 dsh 清单', manifest.dsh !== undefined])
checks.push(['声明了 dsh.bundle', manifest.dsh?.bundle?.patch !== undefined])
checks.push(['声明了 repository（注册表据此拉取元数据）', manifest.repository?.url?.includes('Markdown-Review-Mode') === true])
checks.push(['README 存在', readFileSync(`${root}README.md`, 'utf8').length > 0])
checks.push(['有可扫描的源码', readFileSync(`${root}src/index.ts`, 'utf8').length > 0])
checks.push(['files 包含 LICENSE', (manifest.files ?? []).includes('LICENSE')])

let failed = 0
for (const [label, ok] of checks) {
  if (!ok) failed += 1
  console.log(`${ok ? '✓' : '✗'} ${label}`)
}
console.log(failed === 0 ? '\nall local checks pass' : `\n${failed} check(s) fail`)
