/**
 * Server-side validation: what the Agent is allowed to do to an annotated
 * document.
 *
 * The design's intent is that the Agent's changes are checked by the program,
 * not by the model's discretion. That intent needs a decidable rule, and the
 * design's original rule table could not decide four cases:
 *
 * 1. A rule that only checked *which block* an edit landed on, never *what
 *    it did to that block*, could not tell a rewrite from a move.
 * 2. **Deleting or moving a locked block** had no rule at all: the lock check
 *    was a substring test on a replacement's content, which a delete never
 *    produces.
 * 3. The lock check tested only that the quote *survived* somewhere in the
 *    new content, so the Agent could keep the quoted sentence and prepend or
 *    append arbitrary text to the block around it.
 * 4. "An inner lock outranks an outer comment" was an instruction to the
 *    model, with no corresponding rejection in the server.
 *
 * The rules below replace that table with one that is decidable from the
 * submitted edits alone.
 *
 * There are two kinds of constraint — a comment asks for work, a lock forbids
 * it — and every decision follows from that pair.
 *
 * @module markdown-review-mode/core/validate
 */
import type { AnnotationKind } from './anchors.ts';
import type { Edit, WireAnnotation } from './contract.ts';
/** Why one edit was refused. */
export interface EditRejection {
    /** The edit's index in the submitted list. */
    readonly editIndex: number;
    /** A stable machine-readable reason. */
    readonly code: string;
    /** A human-readable explanation. */
    readonly message: string;
}
/** The outcome of validating a set of edits against a set of annotations. */
export interface ValidationOutcome {
    /** The edits that passed. */
    readonly accepted: readonly Edit[];
    /** The edits that were refused, with the reason. */
    readonly rejected: readonly EditRejection[];
    /** The annotations whose proposed change the rules forbade. */
    readonly conflicts: readonly string[];
    /** The blocks the accepted edits may touch, in the submitted block list. */
    readonly editableBlocks: ReadonlySet<number>;
}
/**
 * Classify what may be done to each block.
 *
 * A block's permissions are the union of what every annotation covering it
 * allows, with the strictest constraint winning:
 *
 * - A **comment** permits replacing the block's content, deleting it, and
 *   moving it.
 * - A **lock** permits nothing that changes the block's text, and nothing
 *   that moves it either.
 *
 * A block that no annotation covers may not be changed at all: the reader
 * only spoke about the passages they marked.
 *
 * @param annotations - the round's annotations.
 * @returns the per-block permissions.
 */
export declare function classifyBlocks(annotations: readonly WireAnnotation[]): {
    readonly editable: ReadonlySet<number>;
    readonly locked: ReadonlyMap<number, WireAnnotation>;
};
/**
 * Whether a block's text may be rewritten.
 * @param permissions - the per-block permissions.
 * @param block - the block index to test.
 * @returns true when the block's text may change.
 */
export declare function mayRewrite(permissions: ReturnType<typeof classifyBlocks>, block: number): boolean;
/**
 * Whether a block may be reordered.
 * @param permissions - the per-block permissions.
 * @param block - the block index to test.
 * @returns true when the block may move.
 */
export declare function mayReorder(permissions: ReturnType<typeof classifyBlocks>, block: number): boolean;
/**
 * Whether a block may be deleted.
 * @param permissions - the per-block permissions.
 * @param block - the block index to test.
 * @returns true when the block may be removed.
 */
export declare function mayDelete(permissions: ReturnType<typeof classifyBlocks>, block: number): boolean;
/**
 * Validate the Agent's edits against the round's annotations.
 *
 * @param edits - the edits the Agent proposed.
 * @param annotations - the round's annotations.
 * @param blockTexts - the current text of each block, keyed by block index.
 * @returns the accepted edits, the rejected ones, and the affected annotations.
 */
export declare function validateEdits(edits: readonly Edit[], annotations: readonly WireAnnotation[], blockTexts: ReadonlyMap<number, string>): ValidationOutcome;
/**
 * The annotations that need a receipt.
 *
 * Every annotation except a lock requires one: a lock is not a request, so
 * there is nothing for the Agent to answer. The design's rule table required a
 * receipt only for comments while its instructions required one for every
 * annotation — this resolves the contradiction in favour of the annotations
 * that actually ask for work.
 *
 * @param annotations - the round's annotations.
 * @returns the ids that need a receipt.
 */
export declare function annotationsNeedingReceipt(annotations: readonly WireAnnotation[]): string[];
/**
 * Which annotation kinds a set of edits touches, for the receipt scope check.
 * @param annotations - the round's annotations.
 * @returns a map from annotation id to its kind.
 */
export declare function kindsById(annotations: readonly WireAnnotation[]): Map<string, AnnotationKind>;
//# sourceMappingURL=validate.d.ts.map