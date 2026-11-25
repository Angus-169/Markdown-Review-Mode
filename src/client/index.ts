/**
 * The client half of the review plugin.
 *
 * The client registers a *second* renderer for Markdown files, so the
 * existing reading view keeps working and the user picks "审阅" from the
 * renderer's dropdown. The registration uses the `builtin` priority band on
 * purpose: a renderer that registered at the default `extension` band would
 * sort ahead of the product's own Markdown renderer and become the default
 * view for every `.md` file, which is exactly what the design says must not
 * happen.
 *
 * The client owns no writes. It reads the document over the plugin's own
 * route on the Host's web server and hands the reviewed text back the same
 * way, so the Host is the only writer.
 *
 * @module markdown-review-mode/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the renderer's Context merge (ctx.slots), the locale
// package's merge (ctx.locale), and the document preview registry's merge
// (ctx.documentPreviews).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client'
import { REVIEW_ROUTE, REVIEW_RPC_ENDPOINTS } from '../core/contract.ts'
import type {
  PendingEdits,
  PendingEditsResult,
  ReviewRollbackResult,
  ReviewRoundResult,
  ReviewSaveResult,
  ReviewStylesheet,
  ReviewSubmissionResult,
} from '../core/contract.ts'
import { ReviewBody } from './body.tsx'
import { NS, en, zh } from './locales.ts'

/** This implementation's identity in the document renderer registry. */
export const REVIEW_BODY_ID = 'markdown-review-mode/review'

/**
 * The client's required services.
 *
 * The document preview registry is a dependency: the review renderer is
 * registered there, and a client that cannot see the registry has nowhere to
 * offer the review view.
 */
export const inject = ['slots', 'locale', 'documentPreviews']

/**
 * The Host's answer to one operation.
 */
interface HostAnswer<T> {
  readonly ok: boolean
  readonly value?: T
  readonly code?: string
  readonly message?: string
}

/**
 * Call one review operation on the Host.
 *
 * The request is same-origin, so the browser carries the session cookie the
 * Host's trust fence checks; the Host refuses an untrusted or unauthenticated
 * caller before it reads anything.
 *
 * @param operation - the operation to perform.
 * @param payload - the operation's payload.
 * @returns the operation's value.
 */
async function callHost<T>(operation: string, payload: unknown): Promise<T> {
  const response = await fetch(REVIEW_ROUTE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ op: operation, payload }),
  })
  if (!response.ok) {
    throw new Error(`The Host refused the request (HTTP ${String(response.status)}).`)
  }
  const answer = await response.json() as HostAnswer<T>
  if (!answer.ok) {
    throw new Error(answer.message ?? 'The Host refused the request.')
  }
  if (answer.value === undefined) {
    throw new Error('The Host answered without a value.')
  }
  return answer.value
}

/**
 * Read a document for review.
 * @param doc - the document's path.
 * @returns the document's text and version.
 */
export function readReviewDocument(
  doc: string,
): Promise<{ content: string; version: string }> {
  return callHost(REVIEW_RPC_ENDPOINTS.document, { doc })
}

/**
 * Submit a review round.
 * @param submission - the round to submit.
 * @returns the Host's answer.
 */
export function submitReview(
  submission: unknown,
): Promise<ReviewSubmissionResult> {
  return callHost(REVIEW_RPC_ENDPOINTS.submit, submission)
}

/**
 * Read a review round's result.
 * @param roundId - the round's identity.
 * @returns the round's result.
 */
export function readReviewResult(roundId: string): Promise<ReviewRoundResult> {
  return callHost(REVIEW_RPC_ENDPOINTS.result, { roundId })
}

/**
 * Roll one block back to the reviewed version.
 * @param roundId - the round's identity.
 * @param block - the block to restore.
 * @returns the rollback's outcome.
 */
export function rollbackReviewBlock(
  roundId: string,
  block: number,
): Promise<ReviewRollbackResult> {
  return callHost(REVIEW_RPC_ENDPOINTS.rollback, { roundId, block })
}

/**
 * Read the reader's unsaved edits to a document.
 *
 * The edits live in the Harness's storage, not in the reader's repository, so
 * reloading the panel does not throw away work that was never submitted.
 *
 * @param doc - the document's path.
 * @returns the unsaved edits, or undefined when there are none.
 */
export async function readPendingEdits(doc: string): Promise<PendingEdits | undefined> {
  const answer = await callHost<PendingEditsResult>(REVIEW_RPC_ENDPOINTS.pending, { doc })
  return answer.pending
}

/**
 * Save the reader's unsaved edits to a document.
 * @param pending - the edits to save.
 * @returns whether the edits were saved.
 */
export async function savePendingEdits(pending: PendingEdits): Promise<boolean> {
  const answer = await callHost<{ saved: boolean }>(REVIEW_RPC_ENDPOINTS.pendingSave, pending)
  return answer.saved
}

/**
 * Read the user's stylesheet for the review panel.
 *
 * @returns the stylesheet's text and where it came from.
 */
export function readReviewStylesheet(): Promise<ReviewStylesheet> {
  return callHost(REVIEW_RPC_ENDPOINTS.stylesheet, {})
}

/**
 * Save the reader's own edits back to the document.
 *
 * This is the plain "save" path: no annotations, no Agent, just the text the
 * reader typed written to the file — guarded by the version it was read at.
 *
 * @param doc - the document's path.
 * @param content - the text to write.
 * @param baseVersion - the version the text was read at.
 * @returns the save's outcome.
 */
export function saveReviewDocument(
  doc: string,
  content: string,
  baseVersion: string,
): Promise<ReviewSaveResult> {
  return callHost(REVIEW_RPC_ENDPOINTS.save, { doc, content, baseVersion })
}

/**
 * Register the review renderer and its body.
 * @param ctx - the client context.
 */
export function apply(ctx: ClientContext): void {
  const t = ctx.locale.bind(NS)

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'markdown-review-mode: dictionaries')

  ctx.effect(() => {
    const previews = ctx.get('documentPreviews') as {
      register(definition: {
        id: string
        extensions: readonly string[]
        priority: 'builtin' | 'extension'
        title: () => string
        loading: 'text-pages' | 'bytes-complete' | 'renderer'
        wrap?: boolean
      }): () => void
    }
    return previews.register({
      id: REVIEW_BODY_ID,
      extensions: ['md', 'markdown'],
      // The `builtin` band keeps the product's own Markdown renderer first in
      // the dropdown, so the review view is chosen, not imposed.
      priority: 'builtin',
      title: () => t('viewer.label'),
      // The renderer owns its own loading: it needs the whole document at
      // once to compute block ranges, which the paged text mode cannot give.
      loading: 'renderer',
      wrap: false,
    })
  }, 'markdown-review-mode: renderer metadata')

  ctx.effect(() => ctx.slots.inject('sidebar.right.tab.document', () => ctx.slots.register(
    { name: 'sidebar.right.tab.document', key: REVIEW_BODY_ID },
    ReviewBody,
  )), 'markdown-review-mode: body')
}

export { ReviewBody } from './body.tsx'
export { createReviewEditor, destroyReviewEditor } from './editor.ts'
