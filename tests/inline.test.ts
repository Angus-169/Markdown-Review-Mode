/**
 * The inline Markdown renderer's tests.
 *
 * A table is drawn as one element, so its cells are rendered here. A cell
 * holding `**bold**` must show bold — the markers have to go.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { inlineText, renderInlineMarkdown } from '../src/client/inline.ts'
import type { InlineRun } from '../src/client/inline.ts'

/**
 * One run, described compactly, with its nesting intact.
 * @param run - the run.
 * @returns the description.
 */
function describe(run: InlineRun): string {
  const text = run.text ?? inlineText(run.children ?? [])
  return run.tag === '' ? text : `${run.tag}(${(run.children ?? []).map(describe).join('')})`
}

/**
 * The runs of one line, described compactly.
 * @param source - the Markdown text.
 * @returns the runs as `tag:text` pairs.
 */
function shape(source: string): string[] {
  return renderInlineMarkdown(source).map(describe)
}

test('plain text stays plain text', () => {
  assert.deepEqual(shape('just text'), ['just text'])
})

test('bold becomes a strong run and loses its markers', () => {
  assert.deepEqual(shape('a **bold** b'), ['a ', 'strong(bold)', ' b'])
})

test('italic becomes an emphasis run and loses its markers', () => {
  assert.deepEqual(shape('a *italic* b'), ['a ', 'em(italic)', ' b'])
})

test('inline code becomes a code run and loses its backticks', () => {
  assert.deepEqual(shape('a `code` b'), ['a ', 'code(code)', ' b'])
})

test('bold and italic nest', () => {
  assert.deepEqual(shape('**bold and *italic***'), ['strong(bold and em(italic))'])
})

test('a link keeps its label and loses its target', () => {
  const runs = renderInlineMarkdown('see [the docs](https://example.com) now')
  const link = runs.find(run => run.tag === 'a')
  assert.ok(link !== undefined)
  assert.equal(link.href, 'https://example.com')
  assert.equal(inlineText(link.children ?? []), 'the docs')
  assert.equal(runs.some(run => run.text?.includes('example.com') === true), false)
})

test('the markers are gone from the rendered text', () => {
  assert.equal(inlineText(renderInlineMarkdown('**a** *b* `c`')), 'a b c')
})

test('an escaped character loses its backslash', () => {
  assert.equal(inlineText(renderInlineMarkdown('\\*not italic\\*')), '*not italic*')
})

test('empty text renders to nothing', () => {
  assert.deepEqual(renderInlineMarkdown(''), [])
})
