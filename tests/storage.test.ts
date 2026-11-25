/**
 * The storage module's tests.
 *
 * The domain declaration is data the platform validates when it opens the
 * domain, so the shapes are checked here rather than at runtime.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { docKey, reviewDomainSpec, roundRecord, pendingRecord } from '../src/host/storage.ts'
import { ReviewStore } from '../src/host/store.ts'

test('the domain name and its tables are legal unit names', () => {
  const name = /^[a-z][a-z0-9_]*$/
  assert.match(reviewDomainSpec.name, name)
  for (const table of Object.keys(reviewDomainSpec.tables)) {
    assert.match(table, name)
  }
})

test('the domain is per-record, so one document is one file', () => {
  assert.equal(reviewDomainSpec.layout, 'per-record')
})

test('a document key is stable and filesystem safe', () => {
  const key = docKey('D:\\work\\notes.md')
  assert.equal(key, docKey('D:\\work\\notes.md'))
  assert.notEqual(key, docKey('D:\\work\\other.md'))
  assert.match(key, /^[a-zA-Z0-9_-]+$/)
})

test('the round record holds a review round', () => {
  const record = {
    schema: 'markdown-review-mode/1',
    roundId: 'review-1',
    doc: '/work/notes.md',
    base: 'v1',
    createdAt: 1,
    annotations: [{
      id: 'a1',
      kind: 'comment',
      comment: '改这里',
      startBlock: 0,
      startOffset: 0,
      endBlock: 0,
      endOffset: 3,
      quote: 'abc',
      seq: 1,
    }],
    content: 'abc',
  }
  assert.equal(roundRecord.safeParse(record).success, true)

  // The removed `structural` kind must not be accepted back.
  const withStructural = {
    ...record,
    annotations: [{ ...record.annotations[0], kind: 'structural' }],
  }
  assert.equal(roundRecord.safeParse(withStructural).success, false)
})

test('the pending record holds unsaved edits', () => {
  const record = { doc: '/work/notes.md', base: 'v1', content: 'edited', savedAt: 1 }
  assert.equal(pendingRecord.safeParse(record).success, true)
  assert.equal(pendingRecord.safeParse({ ...record, content: 42 }).success, false)
})

test('the pending record keeps the reader\'s comments with the edits', () => {
  const annotation = {
    id: 'a1',
    kind: 'comment',
    comment: '改这里',
    from: 0,
    to: 3,
    quote: 'abc',
    block: 0,
    seq: 1,
    createdAt: 1,
    status: 'open',
  }
  const record = { doc: '/work/notes.md', base: 'v1', content: 'abc', savedAt: 1, annotations: [annotation] }
  assert.equal(pendingRecord.safeParse(record).success, true)
})

test('a pending record written before comments were stored still opens', () => {
  // Older records have no `annotations` field; they must keep working, or an
  // upgrade would discard the reader's unsaved edits.
  const legacy = { doc: '/work/notes.md', base: 'v1', content: 'edited', savedAt: 1 }
  const parsed = pendingRecord.safeParse(legacy)
  assert.equal(parsed.success, true)
  assert.equal(parsed.success ? parsed.data.annotations : 'unexpected', undefined)
})

test('a real sidecar fits the stored round record', () => {
  const store = new ReviewStore()
  const round = store.create({
    doc: '/work/notes.md',
    content: 'hello',
    baseVersion: 'v1',
    annotations: [{
      id: 'a1',
      kind: 'comment',
      comment: '改这里',
      startBlock: 0,
      startOffset: 0,
      endBlock: 0,
      endOffset: 5,
      quote: 'hello',
      seq: 1,
    }],
    createdAt: 1,
  }, 'session-1')

  // The sidecar the Host writes must satisfy the stored record's schema, or
  // the write is refused and the archive silently stays empty.
  const sidecar = ReviewStore.toSidecar(round)
  const parsed = roundRecord.safeParse({ ...sidecar, annotations: [...sidecar.annotations] })
  assert.equal(parsed.success, true, parsed.success ? '' : JSON.stringify(parsed.error.issues))
})

test('the default stylesheet lives in the Harness home, not in a project', async () => {
  const { defaultStylesheetPath } = await import('../src/host/stylesheet.ts')
  const path = defaultStylesheetPath()
  assert.ok(path.endsWith('review.css'), path)
  // The Harness home is not inside anyone's repository.
  assert.equal(path.includes('node_modules'), false)
  assert.match(path, /\.dsh[\\/]review\.css$/)
})

test('the user\'s stylesheet is read from the configured path', async () => {
  const { readStylesheet } = await import('../src/host/stylesheet.ts')
  const fs = {
    resolve: async (path: string) => path,
    readText: async (path: string) => {
      if (path === '/work/mine.css') return '.markdown-review-mode-editor { font-size: 18px }'
      throw new Error('no such file')
    },
  }
  const stylesheet = await readStylesheet(fs as never, '/work/mine.css')
  assert.equal(stylesheet.path, '/work/mine.css')
  assert.equal(stylesheet.css.includes('font-size: 18px'), true)
})

test('a missing stylesheet is not a failure', async () => {
  const { readStylesheet } = await import('../src/host/stylesheet.ts')
  const fs = {
    resolve: async (path: string) => path,
    readText: async () => { throw new Error('no such file') },
  }
  const stylesheet = await readStylesheet(fs as never, '/work/missing.css')
  assert.equal(stylesheet.css, '')
  assert.equal(stylesheet.path, '/work/missing.css')
})
