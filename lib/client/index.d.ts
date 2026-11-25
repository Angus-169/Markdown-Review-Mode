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
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type { PendingEdits, ReviewRollbackResult, ReviewRoundResult, ReviewSaveResult, ReviewStylesheet, ReviewSubmissionResult } from '../core/contract.ts';
/** This implementation's identity in the document renderer registry. */
export declare const REVIEW_BODY_ID = "markdown-review-mode/review";
/**
 * The client's required services.
 *
 * The document preview registry is a dependency: the review renderer is
 * registered there, and a client that cannot see the registry has nowhere to
 * offer the review view.
 */
export declare const inject: string[];
/**
 * Read a document for review.
 * @param doc - the document's path.
 * @returns the document's text and version.
 */
export declare function readReviewDocument(doc: string): Promise<{
    content: string;
    version: string;
}>;
/**
 * Submit a review round.
 * @param submission - the round to submit.
 * @returns the Host's answer.
 */
export declare function submitReview(submission: unknown): Promise<ReviewSubmissionResult>;
/**
 * Read a review round's result.
 * @param roundId - the round's identity.
 * @returns the round's result.
 */
export declare function readReviewResult(roundId: string): Promise<ReviewRoundResult>;
/**
 * Roll one block back to the reviewed version.
 * @param roundId - the round's identity.
 * @param block - the block to restore.
 * @returns the rollback's outcome.
 */
export declare function rollbackReviewBlock(roundId: string, block: number): Promise<ReviewRollbackResult>;
/**
 * Read the reader's unsaved edits to a document.
 *
 * The edits live in the Harness's storage, not in the reader's repository, so
 * reloading the panel does not throw away work that was never submitted.
 *
 * @param doc - the document's path.
 * @returns the unsaved edits, or undefined when there are none.
 */
export declare function readPendingEdits(doc: string): Promise<PendingEdits | undefined>;
/**
 * Save the reader's unsaved edits to a document.
 * @param pending - the edits to save.
 * @returns whether the edits were saved.
 */
export declare function savePendingEdits(pending: PendingEdits): Promise<boolean>;
/**
 * Read the user's stylesheet for the review panel.
 *
 * @returns the stylesheet's text and where it came from.
 */
export declare function readReviewStylesheet(): Promise<ReviewStylesheet>;
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
export declare function saveReviewDocument(doc: string, content: string, baseVersion: string): Promise<ReviewSaveResult>;
/**
 * Register the review renderer and its body.
 * @param ctx - the client context.
 */
export declare function apply(ctx: ClientContext): void;
export { ReviewBody } from './body.tsx';
export { createReviewEditor, destroyReviewEditor } from './editor.ts';
//# sourceMappingURL=index.d.ts.map