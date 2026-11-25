/**
 * The Host's document write.
 *
 * Two rules are guarded here, and both cost real tokens to discover the hard
 * way: the write must carry the **session's sandbox policy**, and a failed write
 * must say why it failed. A write that omits the policy is denied under
 * `workspace-write`, and a denial reported as `stale-version` sends everyone
 * chasing a race that never happened.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { describeWriteFailure } from '../src/host/write.ts'
import { writeDocument } from '../src/host/index.ts'
import { reviewMessage } from '../src/host/message.ts'
import { handleOperation } from '../src/host/rpc.ts'
import { REVIEW_RPC_ENDPOINTS } from '../src/core/contract.ts'
import { ReviewStore } from '../src/host/store.ts'

/**
 * A Host whose filesystem records what it was asked to do.
 * @param failure - an error the write should raise instead of succeeding.
 * @returns the services and the recorded writes.
 */
function hostWith(failure?: unknown) {
  const writes: Array<{ target: unknown; content: string; policy?: { mode: string; workspaceRoot: string } }> = []
  const services = {
    fs: {
      resolve: async (path: string) => ({ key: path }),
      writeText: async (
        target: unknown,
        content: string,
        _expected: unknown,
        _signal: unknown,
        policy?: { mode: string; workspaceRoot: string },
      ) => {
        writes.push({ target, content, policy })
        if (failure !== undefined) throw failure
        return { version: 'v2' }
      },
    },
    connection: {},
    agents: {
      list: () => [{ session: { id: 's1', header: { cwd: 'D:/work' } } }],
    },
    sandboxPolicy: {
      resolve: ({ session }: { session?: { header: { cwd: string } } }) => ({
        mode: 'workspace-write',
        workspaceRoot: session?.header.cwd ?? 'D:/elsewhere',
      }),
    },
  }
  return { services, writes }
}

test('the write carries the session\'s sandbox policy', async () => {
  const { services, writes } = hostWith()
  const result = await writeDocument(services as never, 'D:/work/notes.md', 'text', 'v1')

  assert.deepEqual(result, { ok: true, version: 'v2' })
  assert.equal(writes.length, 1)
  // Without this the backend falls back to its deployment default, whose root
  // is the process directory, and every review write is denied.
  assert.equal(writes[0].policy?.mode, 'workspace-write')
  assert.equal(writes[0].policy?.workspaceRoot, 'D:/work')
})

test('a denied write is reported as denied, not as a race', async () => {
  const denial = Object.assign(new Error('target is outside the workspace root'), { code: 'FS_SANDBOX_DENIED' })
  const { services } = hostWith(denial)
  const result = await writeDocument(services as never, 'D:/work/notes.md', 'text', 'v1')

  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.code, 'sandbox-denied')
  assert.equal(result.message.includes('file policy denies'), true)
})

test('a real version conflict still reports a version conflict', async () => {
  const stale = Object.assign(new Error('stale'), { code: 'FS_STALE_VERSION' })
  const { services } = hostWith(stale)
  const result = await writeDocument(services as never, 'D:/work/notes.md', 'text', 'v1')

  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.code, 'stale-version')
})

test('an unexplained failure keeps its own code', () => {
  const failure = describeWriteFailure(Object.assign(new Error('disk on fire'), { code: 'FS_IO_ERROR' }))
  assert.equal(failure.code, 'FS_IO_ERROR')
  assert.equal(failure.message.includes('disk on fire'), true)

  const bare = describeWriteFailure(new Error('something odd'))
  assert.equal(bare.code, 'write-failed')
  assert.equal(bare.message.includes('something odd'), true)
})

test('a profile without the policy service still writes', async () => {
  const { services, writes } = hostWith()
  const withoutPolicy = { ...services, sandboxPolicy: undefined }
  const result = await writeDocument(withoutPolicy as never, 'D:/work/notes.md', 'text', 'v1')

  assert.equal(result.ok, true)
  assert.equal(writes[0].policy, undefined)
})

test('the wake message names both tools and the round', () => {
  const message = reviewMessage('D:/work/notes.md', 'review-abc-1', '4 条批注')
  assert.equal(message.includes('review-abc-1'), true)
  assert.equal(message.includes('review_read'), true)
  assert.equal(message.includes('review_submit_rework'), true)
  // The summary is already phrased; wrapping it again reads as "批注 4 条批注".
  assert.equal(message.includes('共 4 条批注。'), true)
  assert.equal(message.includes('批注 共 4 条批注'), false)
  assert.equal(message.includes('条批注 条批注'), false)
})

test('the wake message tells the Agent to stop when a refusal is not its to fix', () => {
  const message = reviewMessage('D:/work/notes.md', 'review-abc-1', '1 条批注')
  assert.equal(message.includes('不要重试'), true)
  assert.equal(message.includes('sandbox-denied'), true)
  // The budget is the reason: a refused write is a report, not a puzzle.
  assert.equal(message.includes('报告给用户'), true)
})

/**
 * A Host that records what the save path asked for.
 * @param outcome - what the document write should produce.
 * @returns the Host and the recorded calls.
 */
function saveHost(outcome: { ok: true; version: string } | { ok: false; code: string; message: string }) {
  const calls: string[] = []
  const host = {
    store: new ReviewStore(),
    writeDocument: async (doc: string, _content: string, version: string) => {
      calls.push(`write ${doc} @${version}`)
      return outcome
    },
    clearPending: async (doc: string) => {
      calls.push(`clear ${doc}`)
      return true
    },
  }
  return { host, calls }
}

test('saving the reader\'s edits writes the file and forgets the unsaved copy', async () => {
  const { host, calls } = saveHost({ ok: true, version: 'v2' })
  const answer = await handleOperation(host as never, REVIEW_RPC_ENDPOINTS.save, {
    doc: 'D:/work/notes.md',
    content: 'edited',
    baseVersion: 'v1',
  })

  assert.deepEqual(answer, { ok: true, value: { ok: true, version: 'v2' } })
  // The write is guarded by the version the text was read at, and the stored
  // "unsaved" copy goes away once it is the file.
  assert.deepEqual(calls, ['write D:/work/notes.md @v1', 'clear D:/work/notes.md'])
})

test('a refused save keeps the unsaved copy', async () => {
  const { host, calls } = saveHost({ ok: false, code: 'sandbox-denied', message: 'the file policy denies that write' })
  const answer = await handleOperation(host as never, REVIEW_RPC_ENDPOINTS.save, {
    doc: 'D:/work/notes.md',
    content: 'edited',
    baseVersion: 'v1',
  })

  assert.deepEqual(answer, {
    ok: true,
    value: { ok: false, version: 'v1', message: 'the file policy denies that write' },
  })
  // Clearing here would make the next open claim the edits went nowhere; they
  // are still unsaved work.
  assert.deepEqual(calls, ['write D:/work/notes.md @v1'])
})

test('a save without the text it would write is refused before any write', async () => {
  const { host, calls } = saveHost({ ok: true, version: 'v2' })
  const answer = await handleOperation(host as never, REVIEW_RPC_ENDPOINTS.save, { doc: 'D:/work/notes.md' })
  assert.equal((answer as { ok: boolean }).ok, false)
  assert.deepEqual(calls, [])
})