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
import { REVIEW_ROUTE, REVIEW_RPC_ENDPOINTS } from "../core/contract.js";
import { ReviewBody } from "./body.js";
import { NS, en, zh } from "./locales.js";
/** This implementation's identity in the document renderer registry. */
export const REVIEW_BODY_ID = 'markdown-review-mode/review';
/**
 * The client's required services.
 *
 * The document preview registry is a dependency: the review renderer is
 * registered there, and a client that cannot see the registry has nowhere to
 * offer the review view.
 */
export const inject = ['slots', 'locale', 'documentPreviews'];
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
async function callHost(operation, payload) {
    const response = await fetch(REVIEW_ROUTE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ op: operation, payload }),
    });
    if (!response.ok) {
        throw new Error(`The Host refused the request (HTTP ${String(response.status)}).`);
    }
    const answer = await response.json();
    if (!answer.ok) {
        throw new Error(answer.message ?? 'The Host refused the request.');
    }
    if (answer.value === undefined) {
        throw new Error('The Host answered without a value.');
    }
    return answer.value;
}
/**
 * Read a document for review.
 * @param doc - the document's path.
 * @returns the document's text and version.
 */
export function readReviewDocument(doc) {
    return callHost(REVIEW_RPC_ENDPOINTS.document, { doc });
}
/**
 * Submit a review round.
 * @param submission - the round to submit.
 * @returns the Host's answer.
 */
export function submitReview(submission) {
    return callHost(REVIEW_RPC_ENDPOINTS.submit, submission);
}
/**
 * Read a review round's result.
 * @param roundId - the round's identity.
 * @returns the round's result.
 */
export function readReviewResult(roundId) {
    return callHost(REVIEW_RPC_ENDPOINTS.result, { roundId });
}
/**
 * Roll one block back to the reviewed version.
 * @param roundId - the round's identity.
 * @param block - the block to restore.
 * @returns the rollback's outcome.
 */
export function rollbackReviewBlock(roundId, block) {
    return callHost(REVIEW_RPC_ENDPOINTS.rollback, { roundId, block });
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
export async function readPendingEdits(doc) {
    const answer = await callHost(REVIEW_RPC_ENDPOINTS.pending, { doc });
    return answer.pending;
}
/**
 * Save the reader's unsaved edits to a document.
 * @param pending - the edits to save.
 * @returns whether the edits were saved.
 */
export async function savePendingEdits(pending) {
    const answer = await callHost(REVIEW_RPC_ENDPOINTS.pendingSave, pending);
    return answer.saved;
}
/**
 * Read the user's stylesheet for the review panel.
 *
 * @returns the stylesheet's text and where it came from.
 */
export function readReviewStylesheet() {
    return callHost(REVIEW_RPC_ENDPOINTS.stylesheet, {});
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
export function saveReviewDocument(doc, content, baseVersion) {
    return callHost(REVIEW_RPC_ENDPOINTS.save, { doc, content, baseVersion });
}
/**
 * Register the review renderer and its body.
 * @param ctx - the client context.
 */
export function apply(ctx) {
    const t = ctx.locale.bind(NS);
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'markdown-review-mode: dictionaries');
    ctx.effect(() => {
        const previews = ctx.get('documentPreviews');
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
        });
    }, 'markdown-review-mode: renderer metadata');
    ctx.effect(() => ctx.slots.inject('sidebar.right.tab.document', () => ctx.slots.register({ name: 'sidebar.right.tab.document', key: REVIEW_BODY_ID }, ReviewBody)), 'markdown-review-mode: body');
}
export { ReviewBody } from "./body.js";
export { createReviewEditor, destroyReviewEditor } from "./editor.js";
//# sourceMappingURL=index.js.map