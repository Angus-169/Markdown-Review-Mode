/**
 * Applying a set of edits to a document.
 *
 * The design listed four edit kinds but never said how several of them
 * compose. This module fixes the semantics so the Agent's answer has exactly
 * one meaning:
 *
 * - **Edits address the block list as it was when `review_read` returned it.**
 *   An edit never refers to a block another edit created. The Agent therefore
 *   cannot express "insert after the paragraph I just added" — which is
 *   deliberate: it keeps every edit independently meaningful.
 * - **Edits apply in the order they were submitted.** The order is part of
 *   the contract, and the Agent's output is replayed exactly.
 * - **A `move` relocates a block; it never changes one.** A moved block keeps
 *   its text, so a lock on it stays satisfied.
 * - **The result is computed in full before anything is written.** The caller
 *   receives either the new text or a refusal; a partially applied document is
 *   never produced.
 *
 * ## How whitespace is modelled
 *
 * A document is a sequence of block texts separated by whitespace:
 * `text₀ sep₀ text₁ sep₁ … textₙ₋₁ sepₙ₋₁`, where the separator is the
 * whitespace that *follows* a block.
 *
 * The separator belongs to the **position**, not to the block. Reordering
 * blocks reorders the texts and leaves the separators where they were, so
 * moving the first paragraph to the end does not drag the paragraph break
 * with it. Deleting a block removes both its text and the separator that
 * followed it, so the gap closes. Inserting a block gives it a copy of the
 * separator of the block it was inserted after, so the new text sits in the
 * same whitespace shape as its neighbour.
 *
 * @module markdown-review-mode/core/apply
 */
import type { Block } from './blocks.ts';
import type { Edit } from './contract.ts';
/** The outcome of applying edits. */
export type ApplyResult = 
/** The edits applied; the document's new text. */
{
    readonly ok: true;
    readonly content: string;
    readonly changedBlocks: readonly number[];
    readonly addedBlocks: readonly number[];
    readonly movedBlocks: readonly number[];
}
/** The edits could not be applied; the document is unchanged. */
 | {
    readonly ok: false;
    readonly code: string;
    readonly message: string;
};
/**
 * Apply edits to a document.
 *
 * @param blocks - the document's blocks, in the order `review_read` returned.
 * @param edits - the edits to apply, in submission order.
 * @returns the new document text and the affected block positions, or a refusal.
 */
export declare function applyEdits(blocks: readonly Block[], edits: readonly Edit[]): ApplyResult;
/**
 * Restore one block to a known earlier text.
 *
 * A block rollback rewrites that block's text and leaves every other block
 * alone, which is what a user expects from "undo this one change".
 *
 * @param blocks - the document's current blocks.
 * @param content - the document's current text.
 * @param blockIndex - the block to restore.
 * @param previousText - the text the block should have.
 * @returns the document's new text, or a refusal.
 */
export declare function rollbackBlock(blocks: readonly Block[], content: string, blockIndex: number, previousText: string): ApplyResult;
//# sourceMappingURL=apply.d.ts.map