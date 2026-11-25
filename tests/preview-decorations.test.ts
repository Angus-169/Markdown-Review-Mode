/**
 * The preview plan's contract with CodeMirror.
 *
 * CodeMirror refuses decoration ranges that are added out of order, and it
 * refuses overlapping ranges. A preview plan that breaks either rule makes
 * the *whole editor* fail to build, which looks exactly like "the preview
 * does nothing" — so the plan is checked against the real CodeMirror
 * decoration set here, not against a hand-written approximation of it.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Decoration } from '@codemirror/view'
import { parseBlocks } from '../src/core/blocks.ts'
import { parseMarkdown, planPreviewDecorations } from '../src/core/preview.ts'

/**
 * Build the decoration set the editor would build, and report whether
 * CodeMirror accepts it.
 * @param source - the document text.
 * @param expanded - the block indices the reader opened.
 * @returns the error CodeMirror raised, if any.
 */
function buildSet(source: string, expanded: number[] = []): Error | undefined {
  const blocks = parseBlocks(source)
  const plan = planPreviewDecorations(source, parseMarkdown(source), blocks, expanded[0])
  const ranges = [
    ...plan.hides.map(hide => Decoration.mark({ class: 'cm-review-hidden' }).range(hide.from, hide.to)),
    ...plan.marks.map(mark => Decoration.mark({ class: mark.class }).range(mark.from, mark.to)),
  ]
  try {
    Decoration.set(ranges, true)
    return undefined
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error))
  }
}

test('CodeMirror accepts the decorations of an ordinary document', () => {
  const source = [
    '# 标题',
    '',
    '这是**粗体**和*斜体*，还有 `code`。',
    '',
    '- 第一项',
    '- 第二项',
    '',
    '> 引用',
    '',
    '```ts',
    'const a = 1',
    '```',
    '',
    '[链接](https://example.com)',
  ].join('\n')
  const error = buildSet(source)
  assert.equal(error, undefined, error?.message)
})

test('CodeMirror accepts the decorations of a document with nested emphasis', () => {
  const source = '**粗体里有 *斜体* 和 `code`**'
  const error = buildSet(source)
  assert.equal(error, undefined, error?.message)
})

test('CodeMirror accepts the decorations of an expanded document', () => {
  const source = '# 标题\n\n**粗体**\n\n- 项'
  const blocks = parseBlocks(source)
  const error = buildSet(source, blocks.map(block => block.index))
  assert.equal(error, undefined, error?.message)
})

test('CodeMirror accepts the decorations of a document with mixed content', () => {
  const source = [
    '段落**加粗**结束',
    '',
    '# 标题一',
    '',
    '## 标题二',
    '',
    '> 引用 **加粗**',
    '',
    '1. 有序',
    '2. 列表',
    '',
    '| a | b |',
    '| - | - |',
    '',
    '![图](x.png)',
    '',
    '~~删除~~',
    '',
    '***加粗斜体***',
  ].join('\n')
  const error = buildSet(source)
  assert.equal(error, undefined, error?.message)
})

test('the plan never overlaps a hidden range with a styled one', () => {
  const source = '**粗体**与*斜体*和`code`'
  const blocks = parseBlocks(source)
  const plan = planPreviewDecorations(source, parseMarkdown(source), blocks, undefined)
  for (const hide of plan.hides) {
    for (const mark of plan.marks) {
      const overlaps = hide.from < mark.to && mark.from < hide.to
      assert.equal(overlaps, false, `hide [${hide.from},${hide.to}) overlaps mark [${mark.from},${mark.to})`)
    }
  }
})

test('a replaced range contains no other decoration', () => {
  const source = '| a | b |\n| - | - |\n| **1** | 2 |'
  const blocks = parseBlocks(source)
  const plan = planPreviewDecorations(source, parseMarkdown(source), blocks, undefined)
  const table = plan.replaces.find(replace => replace.kind === 'table')
  assert.ok(table !== undefined)
  for (const mark of plan.marks) {
    const inside = mark.from >= table.from && mark.to <= table.to
    assert.equal(inside, false, 'a drawn table must not contain other decorations')
  }
})

test('the plan is sorted by position', () => {
  const source = '**a** *b* `c`\n\n# d\n\n- e'
  const blocks = parseBlocks(source)
  const plan = planPreviewDecorations(source, parseMarkdown(source), blocks, new Set())
  for (const list of [plan.hides, plan.marks]) {
    for (let index = 1; index < list.length; index += 1) {
      assert.ok(list[index - 1].from <= list[index].from, 'ranges must be sorted by start')
    }
  }
})
