/**
 * What `review_read` hands the Agent.
 *
 * The block list says **where** each block is, and the document text is returned
 * once. A per-block preview would repeat that text, and the review pays for it
 * on every step of the round.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { blockSummaries, blockTexts, readResult } from '../src/host/tools.ts'
import { ReviewStore } from '../src/host/store.ts'

/**
 * Make a round over one document.
 * @param content - the document's text.
 * @returns the round.
 */
function roundOf(content: string) {
  const store = new ReviewStore()
  return store.create({
    doc: '/work/notes.md',
    content,
    baseVersion: 'v1',
    annotations: [{
      id: 'a1',
      kind: 'comment',
      comment: '改这里',
      startBlock: 0,
      startOffset: 0,
      endBlock: 0,
      endOffset: 3,
      quote: '# T',
      seq: 1,
    }],
    createdAt: 1,
  }, 's1')
}

test('a block summary carries a line range, not the text', () => {
  const summaries = blockSummaries('# Title\n\nfirst paragraph\nstill paragraph\n\n- item')
  assert.equal(summaries.length, 3)

  assert.equal(summaries[0].index, 0)
  assert.equal(summaries[0].kind, 'heading')
  assert.equal(summaries[0].startLine, 1)
  assert.equal(summaries[0].endLine, 1)

  // The second block spans two lines, and the range says so.
  assert.equal(summaries[1].startLine, 3)
  assert.equal(summaries[1].endLine, 4)

  assert.equal('preview' in summaries[0], false, 'a summary must not repeat the text')
})

test('a plain read returns the document once and no per-block text', () => {
  const result = readResult(roundOf('# Title\n\nbody'))
  assert.equal(result.content?.includes('body'), true)
  assert.equal(result.blocks.length, 2)
  assert.equal(result.blockTexts, undefined)
})

test('a later read can skip the document it already has', () => {
  const round = roundOf('# Title\n\nbody text')
  // A round's reviewed text never changes, so paying for it twice is waste.
  const result = readResult(round, { includeContent: false })
  assert.equal(result.content, undefined)
  assert.equal(result.blocks.length, 2)
  assert.equal(result.annotations.length, 1)
})

test('a read names the exact text of the blocks it is asked about', () => {
  const result = readResult(roundOf('# Title\n\nbody text\n\n- item'), { blockTexts: [1, 2] })
  assert.deepEqual(result.blockTexts?.map(entry => entry.index), [1, 2])
  assert.equal(result.blockTexts?.[0].text, 'body text')
  assert.equal(result.blockTexts?.[1].text, '- item')
})

test('an unknown block index is dropped rather than invented', () => {
  assert.deepEqual(blockTexts('# Title', [99]), [])
})

test('a repeated index is returned once', () => {
  const texts = blockTexts('# Title\n\nbody', [1, 1, 0])
  assert.deepEqual(texts.map(entry => entry.index), [1, 0])
})

test('the block ranges address the text the Agent was given', () => {
  const source = '# Title\n\nfirst paragraph\nstill paragraph\n\n- item'
  const result = readResult(roundOf(source))
  const lines = result.content.split('\n')
  for (const block of result.blocks) {
    // The range is 1-based and inclusive, so it must point inside the text.
    assert.ok(block.startLine >= 1 && block.endLine <= lines.length, `block ${block.index} is out of range`)
    assert.ok(block.startLine <= block.endLine)
  }
  // Block 1 is the two-line paragraph; its lines really are that paragraph.
  assert.equal(lines[2], 'first paragraph')
  assert.equal(lines[3], 'still paragraph')
})