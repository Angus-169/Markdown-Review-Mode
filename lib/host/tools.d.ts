/**
 * The Agent-facing tools: `review_read` and `review_submit_rework`.
 *
 * The tools are registered with a `when` condition so they are only visible
 * to a model that is actually working on a review. A tool that is registered
 * unconditionally appears in *every* session's system prompt, which both
 * wastes tokens and invites the model to call a review tool when no review is
 * pending.
 *
 * The contract is deliberately block-oriented: the model sees block indices,
 * previews, and quotes, never character offsets. Models handle "rewrite
 * block 7" reliably and "replace characters 412–455" not at all.
 *
 * @module markdown-review-mode/host/tools
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Edit, Receipt, ReviewApplyResult, ReviewReadResult, WireBlock, WireBlockText } from '../core/contract.ts';
import type { ReviewRound, ReviewStore } from './store.ts';
import type { WriteResult } from './write.ts';
/**
 * The block summaries the Agent sees.
 *
 * Each summary says where a block is, not what it says: the document's text is
 * already in the same answer, so repeating a preview of it per block costs
 * tokens and adds nothing the Agent cannot read.
 *
 * @param content - the document's text.
 * @returns one summary per block.
 */
export declare function blockSummaries(content: string): WireBlock[];
/**
 * The text of the blocks the Agent asked about.
 *
 * The text comes from the reviewed document rather than from the file on disk:
 * the two differ while the reader's edits are still unsaved.
 *
 * @param content - the reviewed document's text.
 * @param indices - the block indices to return.
 * @returns one entry per index that exists, in the requested order.
 */
export declare function blockTexts(content: string, indices: readonly number[]): WireBlockText[];
/**
 * The `review_read` tool's result for one round.
 *
 * @param round - the round to project.
 * @param options - the blocks to cut out, and whether to carry the document.
 * @returns what the Agent reads.
 */
export declare function readResult(round: ReviewRound, options?: {
    readonly blockTexts?: readonly number[];
    readonly includeContent?: boolean;
}): ReviewReadResult;
/**
 * The services the tools need from the Host.
 */
export interface ToolHost {
    /** The review store holding the rounds. */
    readonly store: ReviewStore;
    /**
     * Write the document's new text.
     * @param doc - the document's path.
     * @param content - the new text.
     * @param version - the version the write is guarded against.
     * @returns the new version, or the reason the write failed.
     */
    writeDocument(doc: string, content: string, version: string): Promise<WriteResult>;
    /**
     * The current version of a document.
     * @param doc - the document's path.
     * @returns the version.
     */
    documentVersion(doc: string): Promise<string>;
}
/**
 * Register the review tools on a Host context.
 * @param ctx - the Host context.
 * @param host - the services the tools need.
 * @returns a disposer removing both registrations.
 */
export declare function registerReviewTools(ctx: Context, host: ToolHost): () => void;
/**
 * Apply the Agent's answer to a round.
 * @param host - the Host services.
 * @param roundId - the round's identity.
 * @param edits - the proposed edits.
 * @param receipts - the Agent's receipts.
 * @returns the apply outcome.
 */
export declare function applyAnswer(host: ToolHost, roundId: string, edits: readonly Edit[], receipts: readonly Receipt[]): Promise<ReviewApplyResult>;
//# sourceMappingURL=tools.d.ts.map