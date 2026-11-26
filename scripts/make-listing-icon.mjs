/**
 * Rasterise the plugin icon to a PNG for the plugin listing.
 *
 * The listing's storefront tile must be a raster image on GitHub (a vector is
 * refused), so the SVG the plugin ships becomes a PNG here.
 *
 * Run with `node scripts/make-listing-icon.mjs`; the result is committed as
 * `assets/icon-180.png`.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { Resvg } from '@resvg/resvg-js'

const root = fileURLToPath(new URL('../', import.meta.url))
const svg = readFileSync(join(root, 'icon.svg'), 'utf8')

const resvg = new Resvg(svg, {
  fitTo: { mode: 'width', value: 180 },
  background: 'white',
})
const png = resvg.render().asPng()

mkdirSync(join(root, 'assets'), { recursive: true })
const target = join(root, 'assets', 'icon-180.png')
writeFileSync(target, png)
console.log(`wrote assets/icon-180.png (${png.length} bytes)`)
