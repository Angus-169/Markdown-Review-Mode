/**
 * The review plugin's durable state.
 *
 * Two things outlive the panel:
 *
 * - the **sidecar** of the last review round — the record of what the reader
 *   marked and what the Agent did about it;
 * - the reader's **unsaved edits** to the document under review, so that
 *   reloading the panel does not throw away work that was never submitted.
 *
 * Both live in the Harness's own storage, outside the reader's workspace. A
 * review plugin that keeps its working files beside the document it reviews
 * leaves the reader with a directory they never asked for — in a project they
 * may well commit. The Harness's storage is the sanctioned place for
 * plugin-owned state, and it sits under the Harness home, where a repository
 * cannot reach it.
 *
 * One record per document, overwritten in place. There is no pile of
 * versions: the last round and the current unsaved edits are all that is
 * kept, and a second round replaces the first.
 *
 * @module markdown-review-mode/host/storage
 */

import { z } from 'zod'
import type { Context } from '@deepseek-ai/cordis'
import type { DomainSpec, KvTable } from '@deepseek-ai/dsh-storage-domain'

/** One stored annotation. */
const annotationRecord = z.object({
  id: z.string(),
  kind: z.enum(['comment', 'lock']),
  comment: z.string(),
  startBlock: z.number(),
  startOffset: z.number(),
  endBlock: z.number(),
  endOffset: z.number(),
  quote: z.string(),
  seq: z.number(),
})

/**
 * One stored review round.
 *
 * The shape is the sidecar the design describes: the round's identity, the
 * document's version it was made against, the annotations, and the document
 * as the reader reviewed it.
 */
export const roundRecord = z.object({
  schema: z.string(),
  roundId: z.string(),
  doc: z.string(),
  base: z.string(),
  createdAt: z.number(),
  annotations: z.array(annotationRecord),
  content: z.string(),
})

/** One stored review round, inferred from {@link roundRecord}. */
export type RoundRecord = z.infer<typeof roundRecord>

/**
 * One stored annotation as the editor holds it: absolute offsets, so it can be
 * put back into the editor without re-deriving anything.
 *
 * This is a different shape from {@link annotationRecord}, which uses the block
 * coordinates the Agent sees. The two are not interchangeable.
 */
const clientAnnotationRecord = z.object({
  id: z.string(),
  kind: z.enum(['comment', 'lock']),
  comment: z.string(),
  from: z.number(),
  to: z.number(),
  quote: z.string(),
  block: z.number(),
  seq: z.number(),
  createdAt: z.number(),
  status: z.enum(['open', 'stale', 'applied', 'declined', 'conflict', 'unhandled']),
})

/**
 * One stored set of unsaved edits.
 *
 * `base` is the document's version the edits were made against: when the file
 * changes underneath the panel, the edits no longer apply to it and are
 * dropped rather than applied to the wrong text.
 *
 * `annotations` is optional so a record written before the field existed still
 * opens: the reader simply gets their edits back without their comments.
 */
export const pendingRecord = z.object({
  doc: z.string(),
  base: z.string(),
  content: z.string(),
  annotations: z.array(clientAnnotationRecord).optional(),
  savedAt: z.number(),
})

/** One stored set of unsaved edits, inferred from {@link pendingRecord}. */
export type PendingRecord = z.infer<typeof pendingRecord>

/**
 * The review plugin's storage domain.
 *
 * `per-record` layout: each document's round and pending edits are their own
 * document under the domain's tree, and writing one replaces it. That is what
 * keeps the state bounded — one round and one pending edit set per document,
 * whatever the number of rounds that ran.
 */
export const reviewDomainSpec = {
  name: 'dsh_review',
  version: 1,
  layout: 'per-record',
  tables: {
    rounds: { valueSchema: roundRecord },
    pending: { valueSchema: pendingRecord },
  },
} as const satisfies DomainSpec

/**
 * A stable, filesystem-safe key for a document.
 *
 * The key is a hash of the document's path, so the storage tree never holds
 * the reader's file names.
 *
 * @param doc - the document's path.
 * @returns the key.
 */
export function docKey(doc: string): string {
  let low = 0x811c9dc5
  let high = 0x01000193
  for (let index = 0; index < doc.length; index += 1) {
    const code = doc.charCodeAt(index)
    low ^= code
    low = Math.imul(low, 0x01000193) >>> 0
    high ^= code + index
    high = Math.imul(high, 0x85ebca6b) >>> 0
  }
  return `${high.toString(16).padStart(8, '0')}${low.toString(16).padStart(8, '0')}`
}

/** The plugin's open storage, once it is open. */
export interface ReviewStorage {
  /** The last review round of each document. */
  readonly rounds: KvTable<string, RoundRecord>
  /** The unsaved edits of each document. */
  readonly pending: KvTable<string, PendingRecord>
  /** Release the domain. */
  close(): Promise<void>
}

/**
 * Open the review plugin's storage.
 *
 * The storage stack is optional: a profile without it keeps the review
 * panel working, and only the two durable extras — the sidecar and the
 * surviving unsaved edits — are unavailable.
 *
 * @param ctx - the Host context.
 * @returns the open storage, or undefined when the storage stack is absent
 * or the domain could not be opened.
 */
export async function openReviewStorage(ctx: Context): Promise<ReviewStorage | undefined> {
  const facility = ctx.get('storageDomain') as Context['storageDomain'] | undefined
  if (facility === undefined) return undefined
  try {
    const domain = await facility.open(reviewDomainSpec)
    return {
      rounds: domain.table('rounds'),
      pending: domain.table('pending'),
      close: () => domain.close(),
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    ctx.logger?.warn(`markdown-review-mode: the storage domain could not be opened (${reason}); the sidecar and saved edits are unavailable`)
    return undefined
  }
}
