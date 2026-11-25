/**
 * The wire contract shared by the Host half, the Client half, and the Agent.
 *
 * One schema, three consumers:
 *
 * - The **Client** sends a {@link ReviewSubmission}: the document it reviewed,
 *   the annotations it collected, and the text the user edited in place.
 * - The **Host** stores it as a review round, hands it to the Agent through
 *   `review_read`, and applies the Agent's answer through
 *   `review_submit_rework`.
 * - The **Agent** only ever sees block indices, line ranges, and quotes —
 *   never character offsets, which models handle unreliably.
 *
 * The submission is the *whole* review in one message, so the Host owns every
 * write. The client never writes the document and the Host never asks the
 * client to: one writer, one atomic operation, no interleaving.
 *
 * @module markdown-review-mode/core/contract
 */

import type { Annotation, AnnotationKind, AnnotationStatus } from './anchors.ts'
import type { BlockKind } from './blocks.ts'

/** The schema version of the sidecar and the wire payloads. */
export const REVIEW_SCHEMA = 'markdown-review-mode/1'

/**
 * The HTTP route the Client and Host halves share.
 *
 * The Host registers the absolute path; the browser addresses the
 * document-relative form, the same split the shipped open-in-app routes use.
 */
export const REVIEW_ROUTE_PATH = '/markdown-review-mode'

/** The browser-relative form of {@link REVIEW_ROUTE_PATH}. */
export const REVIEW_ROUTE = REVIEW_ROUTE_PATH.slice(1)

/** The operations the route accepts. */
export const REVIEW_RPC_ENDPOINTS = {
  /** The client submits a review round. */
  submit: 'review-submit',
  /** The client reads the current result of a review round. */
  result: 'review-result',
  /** The client rolls one block back to the reviewed version. */
  rollback: 'review-rollback',
  /** The client reads the document for review. */
  document: 'review-document',
  /** The client reads the reader's unsaved edits to a document. */
  pending: 'review-pending',
  /** The client saves the reader's unsaved edits to a document. */
  pendingSave: 'review-pending-save',
  /** The client reads the user's stylesheet for the review panel. */
  stylesheet: 'review-stylesheet',
  /** The client saves the reader's own edits back to the document. */
  save: 'review-save',
} as const

/** The kinds of change the Agent may propose for one block. */
export type EditOp = 'replace' | 'delete' | 'insertAfter' | 'move'

/** One proposed change to the document. */
export interface Edit {
  /** The kind of change. */
  readonly op: EditOp
  /** The block the change applies to, in the block list `review_read` returned. */
  readonly block: number
  /** The replacement text; required by `replace` and `insertAfter`. */
  readonly content?: string
  /** The destination block for `move`; absent means the end of the document. */
  readonly to?: number
}

/** How the Agent answered one annotation. */
export type ReceiptStatus =
  /** The annotated range was changed. */
  | 'applied'
  /** The Agent left it alone and said why. */
  | 'declined'
  /** The Agent wanted to change it but the rules forbade it. */
  | 'conflict'

/** The Agent's answer for one annotation. */
export interface Receipt {
  /** The annotation this answers. */
  readonly annotationId: string
  /** What happened. */
  readonly status: ReceiptStatus
  /** What changed, or why nothing did. Never empty. */
  readonly note: string
}

/** One annotation as it crosses the wire. */
export interface WireAnnotation {
  /** Unique within the round. */
  readonly id: string
  /** What the annotation constrains. */
  readonly kind: AnnotationKind
  /** The free-text instruction; empty for a lock. */
  readonly comment: string
  /** The block the range starts in. */
  readonly startBlock: number
  /** The offset inside that block. */
  readonly startOffset: number
  /** The block the range ends in. */
  readonly endBlock: number
  /** The offset inside that block. */
  readonly endOffset: number
  /** The exact source text the range covers. */
  readonly quote: string
  /** Creation order, for stable sorting. */
  readonly seq: number
}

/** What the Client sends to start a review round. */
export interface ReviewSubmission {
  /** The workspace-relative path of the reviewed document. */
  readonly doc: string
  /** The document's content when the user submitted, after their edits. */
  readonly content: string
  /** The version of the document the client read, for staleness detection. */
  readonly baseVersion: string
  /** The annotations collected in this round. */
  readonly annotations: readonly WireAnnotation[]
  /** When the user submitted. */
  readonly createdAt: number
}

/** What the Host reports back for a submission. */
export interface ReviewAccepted {
  /** Whether the round was accepted. */
  readonly ok: true
  /** The round's identity, for reading its result. */
  readonly roundId: string
  /** How many annotations of each kind were accepted. */
  readonly summary: { readonly comment: number; readonly lock: number }
}

/** Why a submission was refused. */
export interface ReviewRejected {
  /** Whether the round was accepted. */
  readonly ok: false
  /** A stable machine-readable reason. */
  readonly code: string
  /** A human-readable explanation. */
  readonly message: string
}

/** The Host's answer to a submission. */
export type ReviewSubmissionResult = ReviewAccepted | ReviewRejected

/**
 * The block summary the Agent sees.
 *
 * It carries **where** a block is, not **what** it says: the document's text is
 * already in `content`, so a per-block preview would repeat it. The line range
 * is what ties the two together — a block's identity is its index, and its
 * extent in the text is these two line numbers.
 */
export interface WireBlock {
  /** The block's index in the document. */
  readonly index: number
  /** What the block is. */
  readonly kind: BlockKind
  /** The block's content hash. */
  readonly hash: string
  /** The block's first source line, 1-based and inclusive. */
  readonly startLine: number
  /** The block's last source line, 1-based and inclusive. */
  readonly endLine: number
}

/**
 * One block's exact text, for the blocks the Agent asked about.
 *
 * The text comes from the reviewed document, not from the file on disk: the two
 * can differ while the reader's own edits are still unsaved.
 */
export interface WireBlockText {
  /** The block's index. */
  readonly index: number
  /** The block's exact source text. */
  readonly text: string
}

/** What `review_read` returns to the Agent. */
export interface ReviewReadResult {
  /** The document's path. */
  readonly doc: string
  /** The round's identity. */
  readonly roundId: string
  /** The document's blocks. */
  readonly blocks: readonly WireBlock[]
  /** The annotations, with their ranges in block coordinates. */
  readonly annotations: readonly WireAnnotation[]
  /** The locked ranges, called out so the Agent cannot miss them. */
  readonly locks: readonly WireAnnotation[]
  /**
   * The document's text.
   *
   * Absent only when the read asked to skip it: a round's reviewed text never
   * changes, so a second read of the same round fetches the annotations alone
   * instead of paying for the document again.
   */
  readonly content?: string
  /**
   * The exact text of the blocks the Agent asked about, when it asked.
   *
   * Absent on a plain read: the Agent already has the whole document there,
   * and repeating it per block is the cost this payload avoids.
   */
  readonly blockTexts?: readonly WireBlockText[]
}

/** One rejected edit, with the reason. */
export interface RejectedEdit {
  /** The edit's index in the submitted list. */
  readonly editIndex: number
  /** A stable machine-readable reason. */
  readonly code: string
  /** A human-readable explanation. */
  readonly message: string
}

/**
 * The reader's unsaved work on the document under review.
 *
 * It lives in the Harness's storage rather than in the reader's repository, so
 * closing the panel — or switching it to another renderer and back — does not
 * throw away work that was never submitted, and the project directory stays
 * free of the plugin's files.
 */
export interface PendingEdits {
  /** The document's path. */
  readonly doc: string
  /** The document's version the edits were made against. */
  readonly base: string
  /** The edited text. */
  readonly content: string
  /**
   * The annotations collected so far.
   *
   * They live in the editor's own state while the panel is open, so without
   * this they vanish when the panel unmounts — a switch to the product's
   * Markdown view and back would silently drop every comment.
   */
  readonly annotations?: readonly Annotation[]
  /** When the edits were saved. */
  readonly savedAt: number
}

/** What the client reads back for a document's unsaved edits. */
export interface PendingEditsResult {
  /** The unsaved edits, or undefined when there are none. */
  readonly pending?: PendingEdits
}

/** What saving the reader's own edits produced. */
export interface ReviewSaveResult {
  /** Whether the document was written. */
  readonly ok: boolean
  /** The document's version after the write. */
  readonly version: string
  /** A human-readable explanation when the write did not happen. */
  readonly message?: string
}

/**
 * The user's stylesheet for the review panel.
 *
 * The panel is rendered by the plugin, so the user's own CSS is how they make
 * it look the way they want — a different reading size, a different accent,
 * their own paper. It is served by the Host rather than fetched from the
 * browser, so the file can live anywhere the Host may read.
 */
export interface ReviewStylesheet {
  /** The stylesheet's text; empty when there is none. */
  readonly css: string
  /** Where the stylesheet was read from, for the panel to report. */
  readonly path: string
}

/** What `review_submit_rework` returns. */
export interface ReviewApplyResult {
  /** Whether the document was changed. */
  readonly ok: boolean
  /** How many edits were applied. */
  readonly applied: number
  /** The edits that were refused, and why. */
  readonly rejected: readonly RejectedEdit[]
  /** The annotations the Agent never answered. */
  readonly unhandled: readonly string[]
  /** The annotations whose change the rules forbade. */
  readonly conflicts: readonly string[]
  /** The document's version after the change. */
  readonly newVersion: string
  /** The blocks the Agent changed, in the new document. */
  readonly changedBlocks: readonly number[]
  /** The blocks the Agent added, in the new document. */
  readonly addedBlocks: readonly number[]
  /** The blocks the Agent moved, in the new document. */
  readonly movedBlocks: readonly number[]
}

/** What the client reads back after the Agent has worked. */
export interface ReviewRoundResult {
  /** The round's identity. */
  readonly roundId: string
  /** Whether the Agent has finished. */
  readonly settled: boolean
  /** The document's content after the Agent's changes. */
  readonly content: string
  /** The document's version. */
  readonly version: string
  /** The Agent's answers. */
  readonly receipts: readonly Receipt[]
  /** The annotations the Agent never answered. */
  readonly unhandled: readonly string[]
  /** The blocks the Agent changed. */
  readonly changedBlocks: readonly number[]
  /** The blocks the Agent added. */
  readonly addedBlocks: readonly number[]
  /** The blocks the Agent moved. */
  readonly movedBlocks: readonly number[]
  /** The annotation's final status, keyed by annotation id. */
  readonly statuses: Readonly<Record<string, AnnotationStatus>>
}

/** The result of a rollback request. */
export interface ReviewRollbackResult {
  /** Whether the rollback happened. */
  readonly ok: boolean
  /** The document's content after the rollback. */
  readonly content: string
  /** The document's version after the rollback. */
  readonly version: string
  /** A human-readable explanation when the rollback did not happen. */
  readonly message?: string
}
