/**
 * The live-preview planner's tests.
 *
 * The planner is pure: Markdown in, a list of ranges out. That makes the
 * whole rendering rule testable without a browser — which matters, because
 * the rule is the difference between "reads like a document" and "reads like
 * a source file".
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseBlocks } from '../src/core/blocks.ts'
import { parseMarkdown, parseTable, planPreviewDecorations } from '../src/core/preview.ts'

/**
 * The plan for one document.
 * @param source - the document text.
 * @param expanded - the block index the reader opened.
 * @returns the planner's output.
 */
function plan(source: string, expanded?: number) {
  const blocks = parseBlocks(source)
  return planPreviewDecorations(source, parseMarkdown(source), blocks, expanded)
}

/**
 * The text of one range.
 * @param source - the document text.
 * @param range - the range.
 * @returns the covered text.
 */
function text(source: string, range: { from: number; to: number }): string {
  return source.slice(range.from, range.to)
}

/**
 * Every hidden range's text, joined.
 * @param source - the document text.
 * @param result - the plan.
 * @returns the hidden text.
 */
function hiddenText(source: string, result: { hides: readonly { from: number; to: number }[] }): string {
  return result.hides.map(hide => text(source, hide)).join('')
}

test('inline emphasis markers are hidden', () => {
  const source = '这是**粗体**和*斜体*。'
  const result = plan(source)
  // Every emphasis marker character disappears and nothing else does:
  // `**粗体**` contributes four, `*斜体*` two.
  assert.equal(hiddenText(source, result), '******')
})

test('inline code keeps its backticks hidden and is styled', () => {
  const source = '用 `code` 标记。'
  const result = plan(source)
  assert.equal(hiddenText(source, result), '``')
  assert.ok(result.marks.some(mark => mark.class === 'cm-review-code'))
})

test('emphasis is styled', () => {
  const source = '**粗体** 与 *斜体*'
  const result = plan(source)
  assert.ok(result.marks.some(mark => mark.class === 'cm-review-strong'))
  assert.ok(result.marks.some(mark => mark.class === 'cm-review-em'))
})

test('a heading hash is hidden and its text is styled by level', () => {
  const source = '## 二级标题'
  const result = plan(source)
  assert.equal(hiddenText(source, result), '##')
  const heading = result.marks.find(mark => mark.class === 'cm-review-h2')
  assert.ok(heading !== undefined)
  assert.equal(text(source, heading), '二级标题')
})

test('a quote marker is hidden', () => {
  const source = '> 引用'
  const result = plan(source)
  assert.equal(hiddenText(source, result), '>')
})

test('a list bullet is drawn as a bullet', () => {
  const source = '- 第一项\n- 第二项'
  const result = plan(source)
  const bullets = result.replaces.filter(replace => replace.kind === 'bullet')
  assert.equal(bullets.length, 2)
  assert.deepEqual(bullets.map(bullet => bullet.text), ['•', '•'])
})

test('an ordered list keeps its numbers', () => {
  const source = '1. one\n2. two'
  const result = plan(source)
  const bullets = result.replaces.filter(replace => replace.kind === 'bullet')
  assert.deepEqual(bullets.map(bullet => bullet.text), ['1.', '2.'])
})

test('a table is drawn as a table', () => {
  const source = '| a | b |\n| - | - |\n| 1 | 2 |'
  const blocks = parseBlocks(source)
  assert.equal(blocks[0].kind, 'table')
  const result = plan(source)
  const tables = result.replaces.filter(replace => replace.kind === 'table')
  assert.equal(tables.length, 1)
  assert.deepEqual(tables[0].table?.head, ['a', 'b'])
  assert.deepEqual(tables[0].table?.rows, [['1', '2']])
})

test('a table parses its alignment', () => {
  const table = parseTable('| a | b | c |\n| :-- | :-: | --: |\n| 1 | 2 | 3 |')
  assert.deepEqual(table?.align, ['left', 'center', 'right'])
})

test('an expanded block shows its source verbatim', () => {
  const source = '第一段 **粗体**\n\n第二段 *斜体*'
  const blocks = parseBlocks(source)
  const result = plan(source, blocks[0].index)
  // Only the second block's markers are hidden; the first keeps its `**`.
  assert.equal(hiddenText(source, result), '**')
})

test('only the expanded block shows its source', () => {
  const source = '# 标题\n\n**粗体** 与 `code`'
  const blocks = parseBlocks(source)
  // The first block is open; the second still renders. `**` is two marker
  // nodes of two characters each.
  const result = plan(source, blocks[0].index)
  assert.equal(hiddenText(source, result), '****``')
})

test('the expanded block keeps its own markup visible', () => {
  const source = '# 标题\n\n**粗体**'
  const blocks = parseBlocks(source)
  const result = plan(source, blocks[0].index)
  // The heading's hash is inside the open block, so it stays visible.
  assert.equal(hiddenText(source, result), '****')
})

test('the plan never touches a range outside the document', () => {
  const source = 'a **b** c\n\n> quote\n\n- item'
  const result = plan(source)
  for (const range of [...result.marks, ...result.hides, ...result.replaces]) {
    assert.ok(range.from >= 0)
    assert.ok(range.to <= source.length)
    assert.ok(range.from < range.to)
  }
})
