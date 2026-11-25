/**
 * The Host half of the client↔Host channel.
 *
 * The channel is one HTTP route on the composition's web server, exactly the
 * shape `@deepseek-ai/dsh-host-open-in-app` uses: a plugin that needs the
 * browser to reach it registers a route on `ctx.webServer` and asks the
 * composition's `connection` service whether the caller may.
 *
 * This is deliberately *not* `ctx.remote`: that namespace is assembled at
 * build time from a fixed list, so a plugin outside the product cannot add
 * to it, and whether a third-party client package can reach `ctx.remote` at
 * all is unverified. A route on `ctx.webServer` needs no build-time
 * cooperation.
 *
 * The trust story has one home, here: every request is checked by the
 * connection's Host/Origin fence and browser authentication *before* any
 * document is read, so a cross-site caller learns nothing about the
 * workspace.
 *
 * One operation does all the writing:
 *
 * 1. the client's submission is checked;
 * 2. the reviewed document is written, guarded by its version;
 * 3. the sidecar the Agent reads is written beside it;
 * 4. the Agent is woken with a message naming the round.
 *
 * The client never writes the document and the Host never asks the client
 * to: one writer, one atomic operation, no interleaving.
 *
 * @module markdown-review-mode/host/rpc
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import {
  REVIEW_ROUTE_PATH,
  REVIEW_ROUTE,
  REVIEW_RPC_ENDPOINTS,
} from '../core/contract.ts'
import type {
  PendingEdits,
  ReviewRollbackResult,
  ReviewRoundResult,
  ReviewSaveResult,
  ReviewStylesheet,
  ReviewSubmission,
  ReviewSubmissionResult,
} from '../core/contract.ts'
import { parseBlocks } from '../core/blocks.ts'
import { rollbackBlock } from '../core/apply.ts'
import type { ReviewStore, ReviewSidecar } from './store.ts'
import { ReviewStore as Store } from './store.ts'
import type { WriteResult } from './write.ts'

/** The operations the route accepts. */
const OPERATIONS = new Set<string>(Object.values(REVIEW_RPC_ENDPOINTS))

/**
 * The largest request body the route reads.
 *
 * A submission carries the whole reviewed document plus every annotation, so
 * the ceiling has to be well above a large document; it is still a ceiling,
 * because an unbounded body is a denial-of-service.
 */
const MAX_BODY_BYTES = 16 * 1024 * 1024

/**
 * The trust surface consumed here; the connection package owns the full type.
 */
interface ReviewConnection {
  /**
   * The refusal this request earns, if any.
   * @param request - the incoming request.
   * @returns 401 or 403 for a refused caller, undefined when the caller may proceed.
   */
  requestRejection(request: { readonly headers: IncomingMessage['headers'] }): 401 | 403 | undefined
}

/**
 * The composition's connection service, typed locally.
 * @param ctx - the plugin context.
 * @returns the trust fence.
 */
function connectionOf(ctx: Context): ReviewConnection {
  return Reflect.get(ctx, 'connection') as ReviewConnection
}

/**
 * The services the route needs from the Host.
 */
export interface RpcHost {
  /** The review store holding the rounds. */
  readonly store: ReviewStore
  /**
   * Read a document's text and version.
   * @param doc - the document's path.
   * @returns the text and version, or the reason the read failed.
   */
  readDocument(doc: string): Promise<{ readonly ok: true; readonly content: string; readonly version: string } | { readonly ok: false; readonly reason: string }>
  /**
   * Write a document's text, guarded by its current version.
   * @param doc - the document's path.
   * @param content - the new text.
   * @param version - the version the write is guarded against.
   * @returns the new version, or the reason the write failed.
   */
  writeDocument(doc: string, content: string, version: string): Promise<WriteResult>
  /**
   * Read the reader's unsaved edits to a document.
   * @param doc - the document's path.
   * @returns the unsaved edits, or undefined when there are none.
   */
  readPending(doc: string): Promise<PendingEdits | undefined>
  /**
   * Save the reader's unsaved edits to a document.
   * @param pending - the edits.
   * @returns whether the edits were saved.
   */
  writePending(pending: PendingEdits): Promise<boolean>
  /**
   * Drop the reader's unsaved edits to a document.
   * @param doc - the document's path.
   * @returns whether there was anything to drop.
   */
  clearPending(doc: string): Promise<boolean>
  /**
   * Write the sidecar of a review round.
   * @param doc - the document's path.
   * @param sidecar - the round's record.
   * @returns whether the sidecar was written.
   */
  writeSidecar(doc: string, sidecar: ReviewSidecar): Promise<boolean>
  /**
   * Read the user's stylesheet for the review panel.
   * @returns the stylesheet's text and where it came from.
   */
  readStylesheet(): Promise<ReviewStylesheet>
  /**
   * Wake the Agent with a review message.
   * @param doc - the reviewed document's path.
   * @param roundId - the round's identity.
   * @param summary - a human-readable summary of the round.
   */
  notifyAgent(doc: string, roundId: string, summary: string): Promise<void>
  /**
   * The Session a document belongs to, for waking the right Agent.
   * @param doc - the document's path.
   * @returns the session id, or undefined.
   */
  sessionOf(doc: string): string | undefined
}

/**
 * A JSON answer.
 * @param res - the response to write.
 * @param status - the status code.
 * @param payload - the body.
 */
function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(payload))
}

/**
 * Collect a bounded request body as UTF-8 text.
 * @param req - the incoming request.
 * @returns the body, or undefined past the ceiling.
 */
async function readBoundedBody(req: IncomingMessage): Promise<string | undefined> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string)
    size += buffer.length
    if (size > MAX_BODY_BYTES) {
      req.destroy()
      return undefined
    }
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * Handle one operation.
 * @param host - the Host services.
 * @param operation - the requested operation.
 * @param payload - the operation's payload.
 * @returns the operation's result.
 */
export async function handleOperation(
  host: RpcHost,
  operation: string,
  payload: unknown,
): Promise<unknown> {
  switch (operation) {
    case REVIEW_RPC_ENDPOINTS.document: {
      const request = payload as { doc?: string }
      if (typeof request.doc !== 'string' || request.doc.length === 0) {
        return { ok: false, code: 'bad-request', message: 'A document path is required.' }
      }
      const read = await host.readDocument(request.doc)
      if (!read.ok) {
        return { ok: false, code: 'not-found', message: `The document could not be read: ${read.reason}` }
      }
      return { ok: true, value: { content: read.content, version: read.version } }
    }

    case REVIEW_RPC_ENDPOINTS.stylesheet: {
      return { ok: true, value: await host.readStylesheet() }
    }

    case REVIEW_RPC_ENDPOINTS.save: {
      const request = payload as { doc?: string; content?: string; baseVersion?: string }
      if (typeof request.doc !== 'string' || typeof request.content !== 'string' || typeof request.baseVersion !== 'string') {
        return { ok: false, code: 'bad-request', message: 'A document path, its text, and the version it was read at are required.' }
      }
      const written = await host.writeDocument(request.doc, request.content, request.baseVersion)
      if (!written.ok) {
        const refused: ReviewSaveResult = {
          ok: false,
          version: request.baseVersion,
          message: written.message,
        }
        return { ok: true, value: refused }
      }
      // The edits are the file now: keeping them as "unsaved" would make the
      // next open claim it restored something it did not.
      await host.clearPending(request.doc)
      const saved: ReviewSaveResult = { ok: true, version: written.version }
      return { ok: true, value: saved }
    }

    case REVIEW_RPC_ENDPOINTS.pending: {
      const request = payload as { doc?: string }
      if (typeof request.doc !== 'string' || request.doc.length === 0) {
        return { ok: false, code: 'bad-request', message: 'A document path is required.' }
      }
      const pending = await host.readPending(request.doc)
      return { ok: true, value: { pending } }
    }

    case REVIEW_RPC_ENDPOINTS.pendingSave: {
      const request = payload as Partial<PendingEdits>
      if (typeof request.doc !== 'string' || typeof request.content !== 'string' || typeof request.base !== 'string') {
        return { ok: false, code: 'bad-request', message: 'A document path, a base version, and the edited text are required.' }
      }
      const saved = await host.writePending({
        doc: request.doc,
        base: request.base,
        content: request.content,
        savedAt: typeof request.savedAt === 'number' ? request.savedAt : Date.now(),
      })
      return { ok: true, value: { saved } }
    }

    case REVIEW_RPC_ENDPOINTS.submit: {
      const submission = payload as ReviewSubmission
      if (typeof submission?.doc !== 'string' || typeof submission.content !== 'string') {
        return { ok: false, code: 'bad-request', message: 'A document path and content are required.' }
      }
      const current = await host.readDocument(submission.doc)
      if (!current.ok) {
        return { ok: false, code: 'not-found', message: `The document could not be read: ${current.reason}` }
      }
      if (current.version !== submission.baseVersion) {
        return {
          ok: false,
          code: 'stale-version',
          message: 'The document changed since it was opened for review. Reload it and review again.',
        }
      }

      const round = host.store.create(submission, host.sessionOf(submission.doc) ?? '')
      const sidecar = Store.toSidecar(round)
      await host.writeSidecar(submission.doc, sidecar)

      const summary = `${round.annotations.length} 条批注`
      await host.notifyAgent(submission.doc, round.id, summary)

      // The reader's edits are now part of the round; they must not come back
      // as "unsaved" after the panel reloads.
      await host.clearPending(submission.doc)

      const counts = { comment: 0, lock: 0 }
      for (const annotation of round.annotations) counts[annotation.kind] += 1

      const accepted: ReviewSubmissionResult = {
        ok: true,
        roundId: round.id,
        summary: counts,
      }
      return { ok: true, value: accepted }
    }

    case REVIEW_RPC_ENDPOINTS.result: {
      const request = payload as { roundId?: string }
      if (typeof request.roundId !== 'string') {
        return { ok: false, code: 'bad-request', message: 'A round identifier is required.' }
      }
      const round = host.store.get(request.roundId)
      if (round === undefined) {
        return { ok: false, code: 'not-found', message: 'That review round is no longer available.' }
      }
      const result: ReviewRoundResult = Store.toResult(round)
      return { ok: true, value: result }
    }

    case REVIEW_RPC_ENDPOINTS.rollback: {
      const request = payload as { roundId?: string; block?: number }
      if (typeof request.roundId !== 'string' || typeof request.block !== 'number') {
        return { ok: false, code: 'bad-request', message: 'A round identifier and a block index are required.' }
      }
      const round = host.store.get(request.roundId)
      if (round === undefined) {
        return { ok: false, code: 'not-found', message: 'That review round is no longer available.' }
      }

      const blocks = parseBlocks(round.reviewedContent)
      const restored = rollbackBlock(blocks, round.currentContent, request.block, blocks[request.block]?.text ?? '')
      if (!restored.ok) {
        const refusal: ReviewRollbackResult = {
          ok: false,
          content: round.currentContent,
          version: round.currentVersion,
          message: restored.message,
        }
        return { ok: false, code: restored.code, message: restored.message }
      }

      const written = await host.writeDocument(round.doc, restored.content, round.currentVersion)
      if (!written.ok) {
        return {
          ok: false,
          code: written.code,
          message: written.message,
        }
      }

      host.store.rollback(round.id, restored.content, written.version)
      const answer: ReviewRollbackResult = { ok: true, content: restored.content, version: written.version }
      return { ok: true, value: answer }
    }

    default:
      return { ok: false, code: 'unknown-operation', message: `Unknown review operation "${operation}".` }
  }
}

/**
 * Mount the review route on the composition's web server.
 * @param ctx - the plugin context.
 * @param host - the Host services.
 * @returns a disposer removing the route.
 */
export function mountReviewRoute(ctx: Context, host: RpcHost): () => void {
  const connection = connectionOf(ctx)

  return ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: REVIEW_ROUTE_PATH,
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      // The trust fence first: an untrusted or unauthenticated caller learns
      // nothing, not even whether the document exists.
      const rejection = connection.requestRejection(req)
      if (rejection !== undefined) {
        res.statusCode = rejection
        res.end()
        return
      }

      if (req.method !== 'POST') {
        res.statusCode = 405
        res.setHeader('allow', 'POST')
        res.end()
        return
      }

      const essence = String(req.headers['content-type']).split(';', 1)[0]?.trim().toLowerCase()
      if (essence !== 'application/json') {
        sendJson(res, 415, { ok: false, code: 'unsupported-media-type', message: 'content-type must be application/json' })
        return
      }

      let text: string | undefined
      try {
        text = await readBoundedBody(req)
      } catch {
        sendJson(res, 400, { ok: false, code: 'bad-request', message: 'request body unreadable' })
        return
      }
      if (text === undefined) {
        sendJson(res, 413, { ok: false, code: 'payload-too-large', message: 'request body is too large' })
        return
      }

      let parsed: { op?: string; payload?: unknown }
      try {
        parsed = JSON.parse(text) as { op?: string; payload?: unknown }
      } catch {
        sendJson(res, 400, { ok: false, code: 'bad-request', message: 'request body must be JSON' })
        return
      }

      const operation = parsed.op ?? ''
      if (!OPERATIONS.has(operation)) {
        sendJson(res, 400, { ok: false, code: 'unknown-operation', message: `Unknown review operation "${operation}".` })
        return
      }

      const answer = await handleOperation(host, operation, parsed.payload)
      sendJson(res, 200, answer)
    },
  }), `markdown-review-mode: POST ${REVIEW_ROUTE_PATH}`)
}

export { REVIEW_ROUTE, REVIEW_ROUTE_PATH }
