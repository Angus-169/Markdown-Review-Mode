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
/** The schema version of the sidecar and the wire payloads. */
export const REVIEW_SCHEMA = 'markdown-review-mode/1';
/**
 * The HTTP route the Client and Host halves share.
 *
 * The Host registers the absolute path; the browser addresses the
 * document-relative form, the same split the shipped open-in-app routes use.
 */
export const REVIEW_ROUTE_PATH = '/markdown-review-mode';
/** The browser-relative form of {@link REVIEW_ROUTE_PATH}. */
export const REVIEW_ROUTE = REVIEW_ROUTE_PATH.slice(1);
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
};
//# sourceMappingURL=contract.js.map