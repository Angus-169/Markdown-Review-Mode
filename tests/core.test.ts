/**
 * The core test suite, run on Node's built-in test runner.
 *
 * The suite uses `node:test` rather than a third-party runner so it can be
 * executed directly against the TypeScript sources with Node's native type
 * stripping, with no build step and no worker processes.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import { blockAt, contentBlockAt, hashText, lineOf, parseBlocks } from '../src/core/blocks.ts'
import { alignBlocks, similarity, tokenize } from '../src/core/align.ts'
import {
  fromBlockRange,
  reanchor,
  reanchorAll,
  refreshAnnotations,
  sliceQuote,
  snapRange,
  sortByPosition,
  toBlockRange,
  unionRanges,
} from '../src/core/anchors.ts'
import { applyEdits, rollbackBlock } from '../src/core/apply.ts'
import { annotationsNeedingReceipt, classifyBlocks, validateEdits } from '../src/core/validate.ts'

test('parseBlocks splits a document into top-level blocks', () => {
  const source = [
    '# Title',
    '',
    'First paragraph.',
    '',
    'Second paragraph.',
    '',
    '- one',
    '- two',
    '',
    '> quoted',
    '',
  ].join('\n')

  const blocks = parseBlocks(source)
  assert.deepEqual(blocks.map(block => block.kind), [
    'heading',
    'paragraph',
    'paragraph',
    'list',
    'blockquote',
  ])
  assert.deepEqual(blocks.map(block => block.text), [
    '# Title',
    'First paragraph.',
    'Second paragraph.',
    '- one\n- two',
    '> quoted',
  ])
})

test('parseBlocks closes the partition', () => {
  const source = 'one\n\ntwo\n\nthree'
  const blocks = parseBlocks(source)
  assert.equal(blocks[0].start, 0)
  for (let index = 1; index < blocks.length; index += 1) {
    assert.equal(blocks[index].start, blocks[index - 1].spanEnd)
  }
  assert.equal(blocks[blocks.length - 1].spanEnd, source.length)
})

test('parseBlocks keeps separators verbatim', () => {
  const source = 'one\n\n\ntwo\n'
  const blocks = parseBlocks(source)
  assert.equal(blocks[0].separator, '\n\n\n')
  assert.equal(blocks[1].separator, '\n')
  assert.equal(blocks.map(block => block.text + block.separator).join(''), source)
})

test('parseBlocks treats a fenced code block as one unit', () => {
  const source = ['text', '', '```ts', 'const a = 1', '```', '', 'after'].join('\n')
  const blocks = parseBlocks(source)
  const code = blocks.find(block => block.kind === 'code')
  assert.equal(code?.text, '```ts\nconst a = 1\n```')
})

test('parseBlocks classifies an image-only paragraph', () => {
  assert.equal(parseBlocks('![alt](pic.png)\n')[0].kind, 'image')
})

test('parseBlocks recognises a table with its delimiter row', () => {
  const source = ['| a | b |', '| - | - |', '| 1 | 2 |', '', 'after'].join('\n')
  const blocks = parseBlocks(source)
  assert.equal(blocks[0].kind, 'table')
  assert.equal(blocks[0].text, '| a | b |\n| - | - |\n| 1 | 2 |')
})

test('parseBlocks reports source lines', () => {
  assert.deepEqual(parseBlocks('one\n\ntwo\n\nthree').map(block => block.line), [1, 3, 5])
})

test('parseBlocks handles empty documents', () => {
  assert.deepEqual(parseBlocks(''), [])
  assert.deepEqual(parseBlocks('\n\n\n'), [])
})

test('parseBlocks handles CRLF without shifting offsets', () => {
  // 'one\r\n' is five characters and the blank line's '\r\n' is two, so
  // 'two' starts at index seven rather than five.
  const blocks = parseBlocks('one\r\n\r\ntwo\r\n')
  assert.deepEqual(blocks.map(block => block.text), ['one', 'two'])
  assert.equal(blocks[0].start, 0)
  assert.equal(blocks[1].start, 7)
  assert.equal(blocks[1].end, 10)
})

// Golden vectors: the Host and the Client parse independently and must agree.
for (const vector of [
  { name: 'plain paragraphs', source: 'alpha\n\nbeta', kinds: ['paragraph', 'paragraph'], texts: ['alpha', 'beta'] },
  { name: 'heading then list', source: '# H\n\n- a\n- b', kinds: ['heading', 'list'], texts: ['# H', '- a\n- b'] },
  { name: 'code between paragraphs', source: 'a\n\n```\ncode\n```\n\nb', kinds: ['paragraph', 'code', 'paragraph'], texts: ['a', '```\ncode\n```', 'b'] },
  { name: 'nested list stays one block', source: '- a\n  - b\n- c', kinds: ['list'], texts: ['- a\n  - b\n- c'] },
]) {
  test(`golden vector: ${vector.name}`, () => {
    const first = parseBlocks(vector.source)
    const second = parseBlocks(vector.source)
    assert.deepEqual(first.map(block => block.kind), vector.kinds)
    assert.deepEqual(first.map(block => block.text), vector.texts)
    assert.deepEqual(second.map(block => block.hash), first.map(block => block.hash))
  })
}

test('hashText is stable and distinguishing', () => {
  assert.equal(hashText('abc'), hashText('abc'))
  assert.notEqual(hashText('abc'), hashText('abd'))
  assert.match(hashText('abc'), /^[0-9a-f]{16}$/)
})

test('blockAt finds the owning block, contentBlockAt the content block', () => {
  const source = 'alpha\n\nbeta'
  const blocks = parseBlocks(source)
  assert.equal(blockAt(blocks, 7)?.index, 1)
  assert.equal(contentBlockAt(blocks, 7)?.index, 1)
  assert.equal(contentBlockAt(blocks, 5), undefined)
})

test('lineOf counts lines from one', () => {
  assert.equal(lineOf('a\nb\nc', 0), 1)
  assert.equal(lineOf('a\nb\nc', 2), 2)
  assert.equal(lineOf('a\nb\nc', 4), 3)
})

test('similarity scores identical text as one', () => {
  assert.equal(similarity('hello world', 'hello world'), 1)
})

test('similarity scores unrelated text low', () => {
  assert.ok(similarity('alpha beta gamma', 'zzzz yyyy xxxx') < 0.2)
})

test('similarity survives one edited sentence', () => {
  const before = 'The quick brown fox jumps over the lazy dog near the riverbank at dawn.'
  const after = 'The quick brown fox jumps over the lazy cat near the riverbank at dawn.'
  assert.ok(similarity(before, after) > 0.6)
})

test('similarity survives one edited Chinese clause', () => {
  const before = '我们需要在提交之前复核所有锚点，确保每一处批注仍然有效。'
  const after = '我们需要在提交之前检查所有锚点，确保每一处批注仍然有效。'
  assert.ok(similarity(before, after) > 0.6)
})

test('similarity scores empty against empty as one', () => {
  assert.equal(similarity('', ''), 1)
  assert.equal(similarity('a', ''), 0)
})

test('tokenize splits Latin words, CJK per character, and drops punctuation', () => {
  assert.deepEqual(tokenize('hello world'), ['hello', 'world'])
  assert.deepEqual(tokenize('中文分词'), ['中', '文', '分', '词'])
  assert.deepEqual(tokenize('hello, world!'), ['hello', 'world'])
})

test('alignBlocks matches unchanged blocks exactly', () => {
  const blocks = parseBlocks('one\n\ntwo\n\nthree')
  assert.deepEqual(alignBlocks(blocks, blocks).byOldIndex, [0, 1, 2])
})

test('alignBlocks follows a block whose text was edited', () => {
  const before = parseBlocks('The quick brown fox jumps over the lazy dog near the riverbank at dawn.\n\nSecond paragraph here.')
  const after = parseBlocks('The quick brown fox jumps over the lazy cat near the riverbank at dawn.\n\nSecond paragraph here.')
  assert.deepEqual(alignBlocks(before, after).byOldIndex, [0, 1])
})

test('alignBlocks reports an inserted block as new', () => {
  const alignment = alignBlocks(parseBlocks('one\n\ntwo'), parseBlocks('one\n\ninserted\n\ntwo'))
  assert.equal(alignment.byOldIndex[0], 0)
  assert.equal(alignment.byOldIndex[1], 2)
  assert.equal(alignment.byNewIndex[1], -1)
})

test('alignBlocks reports a deleted block as missing', () => {
  const alignment = alignBlocks(parseBlocks('one\n\ntwo\n\nthree'), parseBlocks('one\n\nthree'))
  assert.equal(alignment.byOldIndex[1], -1)
  assert.equal(alignment.mapping[1].kind, 'missing')
})

test('alignBlocks keeps the mapping monotonic', () => {
  const alignment = alignBlocks(
    parseBlocks('Repeated paragraph text.\n\nOther paragraph text.'),
    parseBlocks('Repeated paragraph text.\n\nOther paragraph text.\n\nRepeated paragraph text.'),
  )
  const first = alignment.byOldIndex[0]
  const second = alignment.byOldIndex[1]
  assert.ok(first >= 0 && second >= 0)
  assert.ok(first < second)
})

test('alignBlocks handles empty inputs', () => {
  assert.deepEqual(alignBlocks([], []).byOldIndex, [])
  assert.deepEqual(alignBlocks([], parseBlocks('a')).byOldIndex, [])
})

function makeAnnotation(overrides) {
  return {
    kind: 'comment',
    comment: 'note',
    block: 0,
    seq: 0,
    createdAt: 0,
    status: 'open',
    ...overrides,
  }
}

test('sliceQuote returns the covered text', () => {
  assert.equal(sliceQuote('hello world', 0, 5), 'hello')
  assert.equal(sliceQuote('hello', 2, 2), '')
})

test('snapRange keeps a range inside one block', () => {
  const source = 'alpha\n\nbeta'
  const blocks = parseBlocks(source)
  assert.deepEqual(snapRange(source, blocks, 1, 4), { from: 1, to: 4 })
})

test('snapRange snaps a range starting in inter-block whitespace', () => {
  const source = 'alpha\n\nbeta'
  const blocks = parseBlocks(source)
  // Offset 5 is the whitespace between the two blocks; the start moves
  // forward to the next block's first character, and the end stays inside
  // that block.
  const snapped = snapRange(source, blocks, 5, 8)
  assert.equal(snapped.from, 7)
  assert.equal(snapped.to, 8)
})

test('snapRange snaps an end that lands in inter-block whitespace backwards', () => {
  const source = 'alpha\n\nbeta'
  const blocks = parseBlocks(source)
  // Offset 6 is still whitespace; an end there moves back to the previous
  // block's last character.
  const snapped = snapRange(source, blocks, 2, 6)
  assert.equal(snapped.from, 2)
  assert.equal(snapped.to, 5)
})

test('snapRange expands an empty selection to its block', () => {
  const source = 'alpha\n\nbeta'
  const blocks = parseBlocks(source)
  assert.deepEqual(snapRange(source, blocks, 2, 2), { from: 0, to: 5 })
})

test('block ranges round-trip', () => {
  const source = 'alpha\n\nbeta'
  const blocks = parseBlocks(source)
  const within = toBlockRange(blocks, 1, 4)
  assert.deepEqual(within, { startBlock: 0, startOffset: 1, endBlock: 0, endOffset: 4 })
  assert.deepEqual(fromBlockRange(blocks, within), { from: 1, to: 4 })

  const across = toBlockRange(blocks, 3, 8)
  assert.equal(across.startBlock, 0)
  assert.equal(across.endBlock, 1)
  assert.deepEqual(fromBlockRange(blocks, across), { from: 3, to: 8 })
})

test('refreshAnnotations adopts text the user typed inside the range', () => {
  const before = makeAnnotation({ id: 'a', from: 0, to: 5, quote: 'alpha' })
  const [refreshed] = refreshAnnotations('ALPHA\n\nbeta', [before])
  assert.equal(refreshed.quote, 'ALPHA')
  assert.equal(refreshed.status, 'open')
})

test('refreshAnnotations marks an annotation stale when its range emptied', () => {
  const before = makeAnnotation({ id: 'a', from: 0, to: 5, quote: 'alpha' })
  const [refreshed] = refreshAnnotations('', [before])
  assert.equal(refreshed.status, 'stale')
})

test('reanchor reports ok when the range still covers the same text', () => {
  const result = reanchor('alpha\n\nbeta', makeAnnotation({ id: 'a', from: 0, to: 5, quote: 'alpha' }))
  assert.equal(result.kind, 'ok')
})

test('reanchor remaps onto a unique occurrence elsewhere', () => {
  const source = 'beta\n\nalpha'
  const result = reanchor(source, makeAnnotation({ id: 'a', from: 0, to: 5, quote: 'alpha' }))
  assert.equal(result.kind, 'remapped')
  if (result.kind === 'remapped') assert.equal(source.slice(result.from, result.to), 'alpha')
})

test('reanchor refuses to guess when the text occurs twice', () => {
  // The range no longer covers the quote, and the quote occurs twice, so
  // there is no unambiguous place to put the annotation.
  const result = reanchor('beta\n\nalpha\n\nalpha', makeAnnotation({ id: 'a', from: 0, to: 5, quote: 'alpha' }))
  assert.equal(result.kind, 'stale')
})

test('reanchor reports stale when the text is gone', () => {
  const result = reanchor('completely different', makeAnnotation({ id: 'a', from: 0, to: 5, quote: 'alpha' }))
  assert.equal(result.kind, 'stale')
})

test('reanchorAll keeps good annotations and stales the lost ones', () => {
  const result = reanchorAll('beta\n\ngone', [
    makeAnnotation({ id: 'a', from: 0, to: 5, quote: 'alpha' }),
    makeAnnotation({ id: 'b', from: 7, to: 11, quote: 'beta' }),
  ])
  assert.equal(result.find(item => item.id === 'a').status, 'stale')
  assert.equal(result.find(item => item.id === 'b').status, 'open')
})

test('sortByPosition orders by position', () => {
  const sorted = sortByPosition([
    makeAnnotation({ id: 'b', from: 10, to: 12, quote: 'bb', seq: 1 }),
    makeAnnotation({ id: 'a', from: 2, to: 4, quote: 'aa', seq: 2 }),
  ])
  assert.deepEqual(sorted.map(item => item.id), ['a', 'b'])
})

test('unionRanges merges overlapping ranges', () => {
  const merged = unionRanges([
    makeAnnotation({ id: 'a', from: 0, to: 10, quote: 'x' }),
    makeAnnotation({ id: 'b', from: 5, to: 15, quote: 'y' }),
  ])
  assert.deepEqual(merged, [{ from: 0, to: 15 }])
})

test('unionRanges keeps disjoint ranges apart', () => {
  const merged = unionRanges([
    makeAnnotation({ id: 'a', from: 0, to: 5, quote: 'x' }),
    makeAnnotation({ id: 'b', from: 10, to: 15, quote: 'y' }),
  ])
  assert.deepEqual(merged, [{ from: 0, to: 5 }, { from: 10, to: 15 }])
})

test('applyEdits replaces a block and keeps the surrounding text', () => {
  const result = applyEdits(parseBlocks('one\n\ntwo\n\nthree'), [{ op: 'replace', block: 1, content: 'TWO' }])
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.content, 'one\n\nTWO\n\nthree')
    assert.deepEqual(result.changedBlocks, [1])
  }
})

test('applyEdits deletes a block with its separator', () => {
  const result = applyEdits(parseBlocks('one\n\ntwo\n\nthree'), [{ op: 'delete', block: 1 }])
  assert.equal(result.ok, true)
  if (result.ok) assert.equal(result.content, 'one\n\nthree')
})

test('applyEdits inserts after a block', () => {
  const result = applyEdits(parseBlocks('one\n\ntwo\n\nthree'), [{ op: 'insertAfter', block: 0, content: 'inserted' }])
  assert.equal(result.ok, true)
  if (result.ok) assert.equal(result.content, 'one\n\ninserted\n\ntwo\n\nthree')
})

test('applyEdits moves a block without changing its text', () => {
  const result = applyEdits(parseBlocks('one\n\ntwo\n\nthree'), [{ op: 'move', block: 0, to: 2 }])
  assert.equal(result.ok, true)
  if (result.ok) assert.equal(result.content, 'two\n\nthree\n\none')
})

test('applyEdits applies several edits in submission order', () => {
  const result = applyEdits(parseBlocks('one\n\ntwo\n\nthree'), [
    { op: 'replace', block: 0, content: 'ONE' },
    { op: 'replace', block: 2, content: 'THREE' },
  ])
  assert.equal(result.ok, true)
  if (result.ok) assert.equal(result.content, 'ONE\n\ntwo\n\nTHREE')
})

test('applyEdits refuses an edit naming a missing block', () => {
  assert.equal(applyEdits(parseBlocks('one'), [{ op: 'replace', block: 9, content: 'x' }]).ok, false)
})

test('applyEdits leaves the document unchanged when one edit fails', () => {
  const result = applyEdits(parseBlocks('one\n\ntwo\n\nthree'), [
    { op: 'replace', block: 0, content: 'ONE' },
    { op: 'replace', block: 42, content: 'x' },
  ])
  assert.equal(result.ok, false)
})

function makeWire(overrides) {
  return {
    comment: '',
    startOffset: 0,
    endOffset: 0,
    quote: '',
    seq: 0,
    ...overrides,
  }
}

test('classifyBlocks lets a comment edit and a lock freezes', () => {
  const permissions = classifyBlocks([
    makeWire({ id: 'c', kind: 'comment', startBlock: 0, endBlock: 0 }),
    makeWire({ id: 'l', kind: 'lock', startBlock: 1, endBlock: 1 }),
  ])
  assert.equal(permissions.editable.has(0), true)
  assert.equal(permissions.locked.has(1), true)
})

const validateTexts = new Map(parseBlocks('one\n\ntwo\n\nthree\n\nfour').map(block => [block.index, block.text]))

test('validateEdits accepts a replacement on a commented block', () => {
  const outcome = validateEdits(
    [{ op: 'replace', block: 0, content: 'ONE' }],
    [makeWire({ id: 'c', kind: 'comment', startBlock: 0, endBlock: 0 })],
    validateTexts,
  )
  assert.equal(outcome.accepted.length, 1)
  assert.equal(outcome.rejected.length, 0)
})

test('validateEdits refuses a replacement on a locked block', () => {
  const outcome = validateEdits(
    [{ op: 'replace', block: 1, content: 'TWO' }],
    [makeWire({ id: 'l', kind: 'lock', startBlock: 1, endBlock: 1 })],
    validateTexts,
  )
  assert.equal(outcome.accepted.length, 0)
  assert.equal(outcome.rejected[0].code, 'locked-block')
  assert.deepEqual(outcome.conflicts, ['l'])
})

test('validateEdits refuses deleting and moving a locked block', () => {
  for (const edit of [{ op: 'delete', block: 1 }, { op: 'move', block: 1, to: 3 }]) {
    const outcome = validateEdits([edit], [makeWire({ id: 'l', kind: 'lock', startBlock: 1, endBlock: 1 })], validateTexts)
    assert.equal(outcome.rejected[0].code, 'locked-block')
  }
})

test('validateEdits refuses a move of an uncovered block', () => {
  const outcome = validateEdits(
    [{ op: 'move', block: 2, to: 3 }],
    [makeWire({ id: 'c', kind: 'comment', startBlock: 0, endBlock: 0 })],
    validateTexts,
  )
  assert.equal(outcome.accepted.length, 0)
  assert.equal(outcome.rejected[0].code, 'not-reorderable')
})

test('validateEdits refuses an edit to an uncovered block', () => {
  const outcome = validateEdits(
    [{ op: 'replace', block: 3, content: 'x' }],
    [makeWire({ id: 'c', kind: 'comment', startBlock: 0, endBlock: 0 })],
    validateTexts,
  )
  assert.equal(outcome.rejected[0].code, 'not-editable')
})

test('validateEdits refuses two edits on one block', () => {
  const outcome = validateEdits(
    [{ op: 'replace', block: 0, content: 'a' }, { op: 'replace', block: 0, content: 'b' }],
    [makeWire({ id: 'c', kind: 'comment', startBlock: 0, endBlock: 0 })],
    validateTexts,
  )
  assert.equal(outcome.accepted.length, 1)
  assert.equal(outcome.rejected[0].code, 'duplicate-block')
})

test('validateEdits refuses an edit naming a missing block', () => {
  const outcome = validateEdits(
    [{ op: 'replace', block: 99, content: 'x' }],
    [makeWire({ id: 'c', kind: 'comment', startBlock: 0, endBlock: 0 })],
    validateTexts,
  )
  assert.equal(outcome.rejected[0].code, 'unknown-block')
})

test('validateEdits lets an inner lock win over an outer comment', () => {
  const outcome = validateEdits(
    [{ op: 'replace', block: 2, content: 'rewritten' }],
    [
      makeWire({ id: 'c', kind: 'comment', startBlock: 2, endBlock: 3 }),
      makeWire({ id: 'l', kind: 'lock', startBlock: 2, endBlock: 2 }),
    ],
    validateTexts,
  )
  assert.equal(outcome.accepted.length, 0)
  assert.equal(outcome.rejected[0].code, 'locked-block')
  assert.ok(outcome.conflicts.includes('l'))
})

test('annotationsNeedingReceipt skips locks', () => {
  const ids = annotationsNeedingReceipt([
    makeWire({ id: 'c', kind: 'comment', startBlock: 0, endBlock: 0 }),
    makeWire({ id: 'c2', kind: 'comment', startBlock: 1, endBlock: 1 }),
    makeWire({ id: 'l', kind: 'lock', startBlock: 0, endBlock: 0 }),
  ])
  assert.deepEqual(ids, ['c', 'c2'])
})

test('rollbackBlock restores one block and leaves the rest alone', () => {
  const blocks = parseBlocks('one\n\ntwo\n\nthree')
  const result = rollbackBlock(blocks, 'ONE\n\ntwo\n\nthree', 0, 'one')
  assert.equal(result.ok, true)
  if (result.ok) assert.equal(result.content, 'one\n\ntwo\n\nthree')
})

test('rollbackBlock refuses a block that does not exist', () => {
  assert.equal(rollbackBlock(parseBlocks('one'), 'one', 5, 'one').ok, false)
})
